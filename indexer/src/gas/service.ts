import {
  Velo,
  VeloError,
  VeloGasSubmissionUnknownError,
  VeloGasWaitError,
  type GasExecutionIdentity,
  type GasSubmitResult,
} from "@carts1024/velo-sdk";
import type {
  GasOperationRecord,
  GasOperationStore,
  NewGasOperation,
} from "./store.js";
import { GasRequestError, verifyGasSignedTransaction } from "./transaction.js";

const GAS_TIMEOUT_MS = 7_000;
const STATUS_TIMEOUT_MS = 1_500;
const OBSERVATION_TIMEOUT_MS = 5_000;
const POLICY_DENIAL_CODES = new Set([
  "contract_not_whitelisted",
  "daily_cap_exceeded",
  "wallet_rate_limited",
]);

export type GasPublicStatus = GasSubmitResult["status"] | "pending" | "denied";

export type GasPublicResult = Readonly<{
  operationId: string;
  status: GasPublicStatus;
  transactionHash: string;
  outerTransactionHash: string | null;
  reservedStroops: string | null;
  actualFeeStroops: string | null;
  expiresAt: string | null;
  reconciliationRequired: boolean;
  errorCode?: string;
}>;

export type InternalGasResult = GasPublicResult & Readonly<{ walletAddress: string }>;

type GasApi = Pick<Velo["gas"], "sponsorAndSubmit" | "getStatus" | "waitForResult">;
type VeloFactory = () => GasApi;

export function createGasClient(): Velo {
  const apiKey = process.env.VELO_GAS_API_KEY?.trim();
  const baseUrl = process.env.VELO_BASE_URL?.trim();

  if (!apiKey || !baseUrl) {
    throw new Error("Configure VELO_GAS_API_KEY and VELO_BASE_URL on the server.");
  }

  return new Velo({ apiKey, baseUrl, timeoutMs: GAS_TIMEOUT_MS });
}

function defaultVeloFactory() {
  return createGasClient().gas;
}

function toPublicResult(operation: GasOperationRecord): GasPublicResult {
  const status: GasPublicStatus =
    operation.status === "claimed" || operation.status === "unresolved"
      ? "pending"
      : (operation.status as GasPublicStatus);

  return {
    operationId: operation.operationId,
    status,
    transactionHash: operation.transactionHash,
    outerTransactionHash: operation.outerTransactionHash,
    reservedStroops: operation.reservedStroops,
    actualFeeStroops: operation.actualFeeStroops,
    expiresAt: operation.expiresAt?.toISOString() ?? null,
    reconciliationRequired: operation.reconciliationRequired,
    ...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
  };
}

function toInternalResult(operation: GasOperationRecord): InternalGasResult {
  return { ...toPublicResult(operation), walletAddress: operation.walletAddress };
}

function patchFromResult(result: GasSubmitResult) {
  return {
    requestId: result.requestId,
    status: result.status,
    transactionHash: result.transactionHash,
    outerTransactionHash: result.outerTransactionHash,
    reservedStroops: result.reservedStroops,
    actualFeeStroops: result.actualFeeStroops,
    expiresAt: new Date(result.expiresAt),
    reconciliationRequired: result.reconciliationRequired,
    errorCode: null,
  } as const;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function safeErrorCode(error: unknown) {
  if (error instanceof VeloError && error.code && /^[a-z0-9_]{1,80}$/i.test(error.code)) {
    return error.code;
  }

  return undefined;
}

function assertOperationId(operationId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new GasRequestError("operationId must be a UUID.");
  }
}

export class GasStationService {
  constructor(
    private readonly store: GasOperationStore,
    private readonly veloFactory: VeloFactory = defaultVeloFactory,
    private readonly allowedContractIds: readonly string[] = [],
  ) {}

  authorize(operationId: string, transactionXdr: string) {
    assertOperationId(operationId);
    const verified = verifyGasSignedTransaction(transactionXdr, this.allowedContractIds);
    return { operationId, ...verified };
  }

  async sponsorAndSubmit(
    operationId: string,
    transactionXdr: string,
    authenticatedWallet: string,
  ): Promise<InternalGasResult> {
    const authorization = this.authorize(operationId, transactionXdr);
    if (authorization.walletAddress !== authenticatedWallet) {
      throw new GasRequestError("The authenticated wallet does not own this signed operation.", 403, "operation_owner_mismatch");
    }

    let operation = await this.store.find(operationId);
    if (operation) {
      return this.recoverExisting(operation, authorization.walletAddress, authorization.transactionHash);
    }

    const newOperation: NewGasOperation = {
      operationId,
      walletAddress: authorization.walletAddress,
      transactionHash: authorization.transactionHash,
    };

    try {
      operation = await this.store.create(newOperation);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      operation = await this.store.find(operationId);
      if (!operation) throw error;
      return this.recoverExisting(operation, authorization.walletAddress, authorization.transactionHash);
    }

    let velo: GasApi;
    try {
      velo = this.veloFactory();
    } catch {
      operation = await this.store.update(operationId, {
        status: "unresolved",
        reconciliationRequired: true,
      });
      return toInternalResult(operation);
    }

    try {
      const result = await velo.sponsorAndSubmit(transactionXdr, {
        idempotencyKey: "talambag-gas:" + operationId,
        timeoutMs: GAS_TIMEOUT_MS,
      });

      operation = await this.store.update(operationId, patchFromResult(result));
      return toInternalResult(operation);
    } catch (error) {
      if (error instanceof VeloGasSubmissionUnknownError) {
        operation = await this.store.update(operationId, {
          requestId: error.recovery.requestId,
          status: "submission_unknown",
          reconciliationRequired: true,
          errorCode: null,
        });

        try {
          const result = await velo.getStatus(error.recovery, { timeoutMs: STATUS_TIMEOUT_MS });
          operation = await this.store.update(operationId, patchFromResult(result));
        } catch {
          // The recovery identity is durable; a later authorized request can observe it.
        }

        return toInternalResult(operation);
      }

      const errorCode = safeErrorCode(error);
      const wasPolicyDenied = errorCode !== undefined && POLICY_DENIAL_CODES.has(errorCode);
      operation = await this.store.update(operationId, {
        status: wasPolicyDenied ? "denied" : "unresolved",
        reconciliationRequired: !wasPolicyDenied,
        errorCode: errorCode ?? null,
      });

      return toInternalResult(operation);
    }
  }

  async getStatus(
    operationId: string,
    authenticatedWallet: string,
    observeUntilTerminal = false,
  ): Promise<InternalGasResult> {
    assertOperationId(operationId);
    let operation = await this.store.find(operationId);
    if (!operation || operation.walletAddress !== authenticatedWallet) {
      throw new GasRequestError("Gas operation not found.", 404, "operation_not_found");
    }

    if (!operation.requestId) {
      return toInternalResult(operation);
    }

    const identity: GasExecutionIdentity = {
      requestId: operation.requestId,
      transactionHash: operation.transactionHash,
    };

    try {
      const velo = this.veloFactory();
      const result = observeUntilTerminal
        ? await velo.waitForResult(identity, {
            timeoutMs: OBSERVATION_TIMEOUT_MS,
            maxAttempts: 6,
            initialDelayMs: 250,
            maxDelayMs: 1_000,
          })
        : await velo.getStatus(identity, { timeoutMs: STATUS_TIMEOUT_MS });
      operation = await this.store.update(operationId, patchFromResult(result));
    } catch (error) {
      if (error instanceof VeloGasWaitError) {
        operation = await this.store.update(operationId, {
          status: "submission_unknown",
          reconciliationRequired: true,
        });
      }
      // Status observation errors never establish success or chain failure.
    }

    return toInternalResult(operation);
  }

  private async recoverExisting(
    operation: GasOperationRecord,
    authenticatedWallet: string,
    transactionHash: string,
  ) {
    if (operation.walletAddress !== authenticatedWallet) {
      throw new GasRequestError("Gas operation not found.", 404, "operation_not_found");
    }
    if (operation.transactionHash !== transactionHash) {
      throw new GasRequestError("operationId is already bound to a different transaction.", 409, "operation_xdr_mismatch");
    }
    if (operation.requestId) {
      return this.getStatus(operation.operationId, authenticatedWallet);
    }

    // Never replay signed XDR after the durable claim, even if the previous request disappeared.
    return toInternalResult(operation);
  }
}
