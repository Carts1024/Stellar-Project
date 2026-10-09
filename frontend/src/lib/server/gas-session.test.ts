import assert from "node:assert/strict";
import test from "node:test";
import type { NextRequest } from "next/server";
import { Keypair } from "@stellar/stellar-sdk";
import {
  createGasSession,
  GAS_SESSION_COOKIE,
  parseGasRequestBody,
  readBoundedJson,
  readGasSession,
  safeGasResult,
} from "./gas-session";

const operationId = "550e8400-e29b-41d4-a716-446655440000";
const walletAddress = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 17)).publicKey();
const transactionHash = "a".repeat(64);

test("wallet session is integrity checked and bound to the signed wallet", () => {
  const previousSecret = process.env.TALAMBAG_GAS_SESSION_SECRET;
  process.env.TALAMBAG_GAS_SESSION_SECRET = "test-session-secret-placeholder-value-00000001";
  try {
    const session = createGasSession(walletAddress);
    const request = {
      cookies: { get: (name: string) => name === GAS_SESSION_COOKIE ? { value: session.value } : undefined },
    } as unknown as NextRequest;

    assert.equal(readGasSession(request), walletAddress);

    const tamperedRequest = {
      cookies: {
        get: () => ({ value: session.value.slice(0, -1) + (session.value.endsWith("a") ? "b" : "a") }),
      },
    } as unknown as NextRequest;
    assert.equal(readGasSession(tamperedRequest), null);
  } finally {
    if (previousSecret === undefined) delete process.env.TALAMBAG_GAS_SESSION_SECRET;
    else process.env.TALAMBAG_GAS_SESSION_SECRET = previousSecret;
  }
});

test("bounded request validation accepts only operation ID and signed XDR", async () => {
  const body = { operationId, signedTransactionXdr: "AA==" };
  assert.deepEqual(parseGasRequestBody(body), body);
  assert.throws(
    () => parseGasRequestBody({ ...body, walletAddress }),
    /Invalid Gas request body/,
  );
  assert.throws(
    () => parseGasRequestBody({ operationId, signedTransactionXdr: "A".repeat(64 * 1024 + 1) }),
    /Invalid Gas request body/,
  );

  const request = new Request("https://app.example.test/api/gas/auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(71 * 1024),
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  await assert.rejects(readBoundedJson(request), /too large/);
});

test("safe client response drops wallet identity, XDR, and credentials", () => {
  const result = safeGasResult(
    {
      operationId,
      status: "submission_unknown",
      transactionHash,
      outerTransactionHash: null,
      reservedStroops: "100",
      actualFeeStroops: null,
      expiresAt: "2026-09-25T12:00:00.000Z",
      reconciliationRequired: true,
      walletAddress,
      transactionXdr: "SIGNED_XDR_PLACEHOLDER",
      apiKey: "VELO_KEY_PLACEHOLDER",
    },
    operationId,
  );

  assert.deepEqual(Object.keys(result).sort(), [
    "actualFeeStroops",
    "expiresAt",
    "operationId",
    "outerTransactionHash",
    "reconciliationRequired",
    "reservedStroops",
    "status",
    "transactionHash",
  ]);
  assert.equal(result.actualFeeStroops, null);
  assert.equal("walletAddress" in result, false);
  assert.equal("transactionXdr" in result, false);
  assert.equal("apiKey" in result, false);
});
