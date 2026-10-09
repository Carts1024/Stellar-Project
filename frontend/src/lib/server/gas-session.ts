import { createHmac, timingSafeEqual } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import type { NextRequest } from "next/server";

export const GAS_SESSION_COOKIE = "talambag_gas_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_GAS_REQUEST_BYTES = 70 * 1024;
const MAX_SIGNED_XDR_CHARS = 64 * 1024;

export type GasRequestBody = Readonly<{
  operationId: string;
  signedTransactionXdr: string;
}>;

export class GasHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "GasHttpError";
  }
}

function getSessionSecret() {
  const secret = process.env.TALAMBAG_GAS_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new GasHttpError("Gas Station server session is not configured.", 503);
  }
  return secret;
}

export function getGasServerConfig() {
  const baseUrl = process.env.NEXT_PUBLIC_TALAMBAG_INDEXER_URL?.trim().replace(/\/+$/, "");
  const internalToken = process.env.INDEXER_GAS_INTERNAL_TOKEN?.trim();

  if (!baseUrl || !internalToken || internalToken.length < 32) {
    throw new GasHttpError("Gas Station server connection is not configured.", 503);
  }
  getSessionSecret();
  return { baseUrl, internalToken };
}

export function isValidOperationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function parseGasRequestBody(value: unknown): GasRequestBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GasHttpError("Invalid Gas request body.", 400);
  }

  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).length !== 2 ||
    !isValidOperationId(body.operationId) ||
    typeof body.signedTransactionXdr !== "string" ||
    body.signedTransactionXdr.length === 0 ||
    body.signedTransactionXdr.length > MAX_SIGNED_XDR_CHARS ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(body.signedTransactionXdr)
  ) {
    throw new GasHttpError("Invalid Gas request body.", 400);
  }

  return { operationId: body.operationId, signedTransactionXdr: body.signedTransactionXdr };
}

export async function readBoundedJson(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new GasHttpError("Content-Type must be application/json.", 415);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_GAS_REQUEST_BYTES)) {
    throw new GasHttpError("Request body is too large.", 413);
  }

  if (!request.body) {
    throw new GasHttpError("A JSON request body is required.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_GAS_REQUEST_BYTES) {
        await reader.cancel();
        throw new GasHttpError("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new GasHttpError("Request body must be valid JSON.", 400);
  }
}

type SessionPayload = Readonly<{ walletAddress: string; expiresAt: number }>;

function sessionSignature(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createGasSession(walletAddress: string) {
  const secret = getSessionSecret();
  const payload: SessionPayload = {
    walletAddress,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    value: encodedPayload + "." + sessionSignature(encodedPayload, secret),
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function readGasSession(request: NextRequest): string | null {
  const value = request.cookies.get(GAS_SESSION_COOKIE)?.value;
  const parts = value?.split(".");
  if (!parts || parts.length !== 2) return null;

  try {
    const secret = getSessionSecret();
    const expected = Buffer.from(sessionSignature(parts[0], secret));
    const supplied = Buffer.from(parts[1]);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (
      typeof payload.walletAddress !== "string" ||
      !StrKey.isValidEd25519PublicKey(payload.walletAddress) ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload.walletAddress;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

export async function postToIndexer(path: string, payload: unknown, timeoutMs: number) {
  const { baseUrl, internalToken } = getGasServerConfig();
  return fetch(baseUrl + path, {
    method: "POST",
    headers: {
      authorization: "Bearer " + internalToken,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function readIndexerJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new GasHttpError("The Gas Station service returned an invalid response.", 502);
  }
}

export function safeGasResult(value: unknown, operationId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GasHttpError("The Gas Station service returned an invalid response.", 502);
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
  const hashPattern = /^[0-9a-f]{64}$/;
  if (
    result.operationId !== operationId ||
    typeof result.status !== "string" ||
    !statuses.includes(result.status) ||
    typeof result.transactionHash !== "string" ||
    !hashPattern.test(result.transactionHash) ||
    (result.outerTransactionHash !== null &&
      (typeof result.outerTransactionHash !== "string" || !hashPattern.test(result.outerTransactionHash))) ||
    (result.reservedStroops !== null &&
      (typeof result.reservedStroops !== "string" || !/^(0|[1-9][0-9]*)$/.test(result.reservedStroops))) ||
    (result.actualFeeStroops !== null &&
      (typeof result.actualFeeStroops !== "string" || !/^(0|[1-9][0-9]*)$/.test(result.actualFeeStroops))) ||
    (result.expiresAt !== null && typeof result.expiresAt !== "string") ||
    typeof result.reconciliationRequired !== "boolean"
  ) {
    throw new GasHttpError("The Gas Station service returned an invalid response.", 502);
  }

  return {
    operationId,
    status: result.status,
    transactionHash: result.transactionHash,
    outerTransactionHash: result.outerTransactionHash,
    reservedStroops: result.reservedStroops,
    actualFeeStroops: result.actualFeeStroops,
    expiresAt: result.expiresAt,
    reconciliationRequired: result.reconciliationRequired,
    ...(typeof result.errorCode === "string" && /^[a-z0-9_]{1,80}$/i.test(result.errorCode)
      ? { errorCode: result.errorCode }
      : {}),
  };
}

export async function safeIndexerError(response: Response) {
  const value = await readIndexerJson(response).catch(() => null);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const body = value as Record<string, unknown>;
    return {
      error: typeof body.error === "string" ? body.error.slice(0, 160) : "Gas operation could not be processed.",
      ...(typeof body.code === "string" && /^[a-z0-9_]{1,80}$/i.test(body.code)
        ? { code: body.code }
        : {}),
    };
  }
  return { error: "Gas operation could not be processed." };
}
