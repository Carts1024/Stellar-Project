"use client";

const LOCAL_OPERATION_PREFIX = "talambag:gas:operations:v1:";
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "denied"]);

export type GasOperationStatus =
  | "claimed"
  | "submission_unknown"
  | "submitted"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "pending"
  | "denied";

export type GasOperationResult = Readonly<{
  operationId: string;
  status: GasOperationStatus;
  transactionHash: string;
  outerTransactionHash: string | null;
  reservedStroops: string | null;
  actualFeeStroops: string | null;
  expiresAt: string | null;
  reconciliationRequired: boolean;
  errorCode?: string;
}>;

export class GasClientError extends Error {
  constructor(
    message: string,
    readonly operationId?: string,
    readonly unresolved = false,
  ) {
    super(message);
    this.name = "GasClientError";
  }
}

function storageKey(walletAddress: string) {
  return LOCAL_OPERATION_PREFIX + walletAddress;
}

function readStoredOperationIds(walletAddress: string) {
  if (typeof window === "undefined") return [] as string[];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(walletAddress)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string" && /^[0-9a-f-]{36}$/i.test(entry))
      : [];
  } catch {
    return [];
  }
}

function writeStoredOperationIds(walletAddress: string, operationIds: readonly string[]) {
  if (typeof window === "undefined") return;
  try {
    if (operationIds.length === 0) {
      window.localStorage.removeItem(storageKey(walletAddress));
    } else {
      window.localStorage.setItem(storageKey(walletAddress), JSON.stringify(operationIds.slice(-20)));
    }
  } catch {
    // Recovery remains available for the current page through the operation ID in memory.
  }
}

export function getPendingGasOperationIds(walletAddress: string) {
  return readStoredOperationIds(walletAddress);
}

function rememberGasOperation(walletAddress: string, operationId: string) {
  const current = readStoredOperationIds(walletAddress).filter((entry) => entry !== operationId);
  writeStoredOperationIds(walletAddress, [...current, operationId]);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("talambag:gas-operation-updated"));
}

function forgetGasOperation(walletAddress: string, operationId: string) {
  writeStoredOperationIds(
    walletAddress,
    readStoredOperationIds(walletAddress).filter((entry) => entry !== operationId),
  );
  if (typeof window !== "undefined") window.dispatchEvent(new Event("talambag:gas-operation-updated"));
}

function isTerminal(status: string) {
  return TERMINAL_STATUSES.has(status);
}

async function readResponse(response: Response, fallbackMessage: string) {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      value && typeof value === "object" && "error" in value && typeof value.error === "string"
        ? value.error
        : fallbackMessage;
    throw new GasClientError(message);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GasClientError("The Gas Station returned an invalid response.");
  }

  const result = value as Record<string, unknown>;
  const statuses = [
    "claimed",
    "submission_unknown",
    "submitted",
    "succeeded",
    "failed",
    "cancelled",
    "pending",
    "denied",
  ];
  if (
    typeof result.operationId !== "string" ||
    typeof result.status !== "string" ||
    !statuses.includes(result.status) ||
    typeof result.transactionHash !== "string" ||
    typeof result.reconciliationRequired !== "boolean" ||
    (result.outerTransactionHash !== null && typeof result.outerTransactionHash !== "string") ||
    (result.reservedStroops !== null && typeof result.reservedStroops !== "string") ||
    (result.actualFeeStroops !== null && typeof result.actualFeeStroops !== "string") ||
    (result.expiresAt !== null && typeof result.expiresAt !== "string")
  ) {
    throw new GasClientError("The Gas Station returned an invalid response.");
  }

  return result as GasOperationResult;
}

export async function getGasOperationStatus(
  operationId: string,
  walletAddress: string,
  observeUntilTerminal = true,
) {
  let response: Response;
  try {
    const query = new URLSearchParams({ operationId });
    if (observeUntilTerminal) query.set("observe", "1");
    response = await fetch("/api/gas?" + query.toString(), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(9_000),
    });
  } catch {
    throw new GasClientError(
      "The Gas Station status is still unresolved. Check this operation again later.",
      operationId,
      true,
    );
  }

  const result = await readResponse(response, "The Gas Station status could not be checked.");
  if (isTerminal(result.status)) forgetGasOperation(walletAddress, operationId);
  else rememberGasOperation(walletAddress, operationId);
  return result;
}

export async function submitGasOperation(
  signedTransactionXdr: string,
  walletAddress: string,
): Promise<GasOperationResult> {
  const operationId = crypto.randomUUID();
  rememberGasOperation(walletAddress, operationId);

  let authorizationResponse: Response;
  try {
    authorizationResponse = await fetch("/api/gas/auth", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId, signedTransactionXdr }),
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    forgetGasOperation(walletAddress, operationId);
    throw new GasClientError("The wallet authorization could not be confirmed.");
  }

  let authorizationBody: unknown = null;
  try {
    authorizationBody = await authorizationResponse.json();
  } catch {
    // The response is rejected below without exposing server internals.
  }
  if (!authorizationResponse.ok || !authorizationBody || typeof authorizationBody !== "object") {
    forgetGasOperation(walletAddress, operationId);
    const message =
      authorizationBody &&
      typeof authorizationBody === "object" &&
      "error" in authorizationBody &&
      typeof authorizationBody.error === "string"
        ? authorizationBody.error
        : "The wallet could not authorize this Gas operation.";
    throw new GasClientError(message);
  }

  let response: Response;
  try {
    response = await fetch("/api/gas", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId, signedTransactionXdr }),
      signal: AbortSignal.timeout(22_000),
    });
  } catch {
    throw new GasClientError(
      "The transaction may have reached the relayer. Its status is unresolved; check this same operation before starting another.",
      operationId,
      true,
    );
  }

  let result: GasOperationResult;
  try {
    result = await readResponse(response, "The Gas Station submission could not be confirmed.");
  } catch (error) {
    if (response.status >= 400 && response.status < 500) {
      forgetGasOperation(walletAddress, operationId);
      throw new GasClientError(
        error instanceof Error ? error.message : "The Gas operation was rejected.",
      );
    }
    throw new GasClientError(
      "The transaction may have reached the relayer. Its status is unresolved; check this same operation before starting another.",
      operationId,
      true,
    );
  }
  if (isTerminal(result.status)) {
    forgetGasOperation(walletAddress, operationId);
    return result;
  }

  rememberGasOperation(walletAddress, operationId);
  try {
    result = await getGasOperationStatus(operationId, walletAddress, true);
  } catch {
    // Keep the operation ID for an authorized status-only retry.
  }
  return result;
}
