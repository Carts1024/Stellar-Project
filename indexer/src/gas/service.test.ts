import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  Account,
  BASE_FEE,
  FeeBumpTransaction,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { Velo, type GasSubmitResult } from "@carts1024/velo-sdk";
import { GasStationService } from "./service.js";
import type {
  GasOperationRecord,
  GasOperationStore,
  GasOperationPatch,
  NewGasOperation,
} from "./store.js";
import { GasRequestError, verifyGasSignedTransaction } from "./transaction.js";

const ALLOWED_CONTRACT_ID = "CC33ZSM7OC3ZGIGWQ7ZRSTEI5XNQJXR42Q67SZ5UAIXPPG5O3TAE4NRY";
const DISALLOWED_CONTRACT_ID = "CDLGOZDVXN7EGXDLLQ7CGGQQCLRUPA3CVIDICRJIK54FS4KBRYAREBU5";
const PLACEHOLDER_API_KEY = "tk_test_" + "0".repeat(32);
const PLACEHOLDER_BASE_URL = "https://velo.example.test";
const REQUEST_ID = "req_test_1234567890";
const OUTER_HASH = "b".repeat(64);
const EXPIRY = "2026-09-25T12:00:00.000Z";

function testKeypair(fill: number) {
  return Keypair.fromRawEd25519Seed(Buffer.alloc(32, fill));
}

function buildSignedTransaction(options: {
  source?: Keypair;
  signer?: Keypair;
  contractId?: string;
  operations?: number;
  sequence?: string;
} = {}) {
  const source = options.source ?? testKeypair(7);
  const signer = options.signer ?? source;
  const contractId = options.contractId ?? ALLOWED_CONTRACT_ID;
  const operationCount = options.operations ?? 1;
  const account = new Account(source.publicKey(), options.sequence ?? "1");
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });

  for (let index = 0; index < operationCount; index += 1) {
    builder.addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: "test_call",
        args: [],
      }),
    );
  }

  const transaction = builder.setTimeout(30).build();
  transaction.sign(signer);
  return { source, transaction, xdr: transaction.toXDR() };
}

function makeGasResult(
  transactionHash: string,
  status: GasSubmitResult["status"],
  overrides: Partial<GasSubmitResult> = {},
): GasSubmitResult {
  return {
    object: "gas_submit_result",
    requestId: REQUEST_ID,
    transactionHash,
    outerTransactionHash: status === "claimed" ? null : OUTER_HASH,
    status,
    reservedStroops: "120",
    actualFeeStroops: status === "succeeded" ? "90" : null,
    expiresAt: EXPIRY,
    reconciliationRequired: status === "submitted" || status === "submission_unknown",
    ...overrides,
  };
}

function makeReservation(transaction: ReturnType<typeof buildSignedTransaction>) {
  return {
    object: "gas_sponsor_reservation",
    requestId: REQUEST_ID,
    replayed: false,
    decision: "reserved",
    transactionHash: transaction.transaction.hash().toString("hex"),
    sourceWallet: transaction.source.publicKey(),
    targetContractIds: [ALLOWED_CONTRACT_ID],
    innerMaxFeeStroops: "120",
    reservedStroops: "120",
    expiresAt: EXPIRY,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type MockRequest = Readonly<{
  url: URL;
  init: RequestInit;
  body: Record<string, unknown>;
}>;

async function withMockVeloTransport<T>(
  transaction: ReturnType<typeof buildSignedTransaction>,
  options: Readonly<{
    submitResult?: GasSubmitResult;
    statusResults?: readonly GasSubmitResult[];
    failSubmit?: boolean;
    sponsorStatus?: number;
    sponsorError?: unknown;
    sponsorFailure?: Readonly<{ status: number; code: string }>;
  }>,
  run: (calls: MockRequest[]) => Promise<T>,
) {
  const calls: MockRequest[] = [];
  const originalFetch = globalThis.fetch;
  let statusIndex = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url, init: init ?? {}, body });

    if (url.pathname === "/api/gas/sponsor") {
      if (options.sponsorError !== undefined) throw options.sponsorError;
      if (options.sponsorFailure) {
        return jsonResponse({
          error: {
            type: "validation_error",
            code: options.sponsorFailure.code,
            message: "Mocked Gas policy denial.",
          },
        }, options.sponsorFailure.status);
      }
      return jsonResponse(makeReservation(transaction), options.sponsorStatus ?? 200);
    }

    if (url.pathname === "/api/gas/submit") {
      if (typeof body.transactionXdr === "string") {
        if (options.failSubmit) throw new TypeError("fetch failed");
        return jsonResponse(options.submitResult ?? makeGasResult(
          transaction.transaction.hash().toString("hex"),
          "submitted",
        ));
      }

      const result = options.statusResults?.[
        Math.min(statusIndex, Math.max(0, (options.statusResults?.length ?? 1) - 1))
      ];
      statusIndex += 1;
      return jsonResponse(
        result ?? makeGasResult(transaction.transaction.hash().toString("hex"), "submission_unknown"),
      );
    }

    throw new Error("Unexpected mocked Velo endpoint.");
  }) as typeof fetch;

  try {
    const result = await run(calls);
    return { result, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

class MemoryGasOperationStore implements GasOperationStore {
  readonly rows = new Map<string, GasOperationRecord>();

  async create(input: NewGasOperation) {
    if (this.rows.has(input.operationId)) {
      throw Object.assign(new Error("duplicate"), { code: "P2002" });
    }
    const record: GasOperationRecord = {
      ...input,
      requestId: null,
      status: "claimed",
      outerTransactionHash: null,
      reservedStroops: null,
      actualFeeStroops: null,
      expiresAt: null,
      reconciliationRequired: false,
      errorCode: null,
    };
    this.rows.set(input.operationId, record);
    return record;
  }

  async find(operationId: string) {
    return this.rows.get(operationId) ?? null;
  }

  async update(operationId: string, patch: GasOperationPatch) {
    const current = this.rows.get(operationId);
    if (!current) throw new Error("missing operation");
    const next = { ...current, ...patch };
    this.rows.set(operationId, next);
    return next;
  }
}

function createVeloFactory() {
  return () =>
    new Velo({
      apiKey: PLACEHOLDER_API_KEY,
      baseUrl: PLACEHOLDER_BASE_URL,
      timeoutMs: 1_000,
      maxRetries: 0,
    }).gas;
}

function createService(store = new MemoryGasOperationStore()) {
  return new GasStationService(store, createVeloFactory(), [ALLOWED_CONTRACT_ID]);
}

test("validates a signed one-operation Testnet contract transaction and rejects untrusted XDR", () => {
  const signed = buildSignedTransaction();
  const authorization = verifyGasSignedTransaction(signed.xdr, [ALLOWED_CONTRACT_ID]);

  assert.equal(authorization.walletAddress, signed.source.publicKey());
  assert.equal(authorization.transactionHash, signed.transaction.hash().toString("hex"));
  assert.equal(authorization.contractId, ALLOWED_CONTRACT_ID);

  assert.throws(
    () => verifyGasSignedTransaction(signed.xdr, [DISALLOWED_CONTRACT_ID]),
    (error: unknown) => error instanceof GasRequestError && error.code === "project_contract_not_allowed",
  );
  assert.throws(
    () => verifyGasSignedTransaction("A".repeat(64 * 1024 + 1), [ALLOWED_CONTRACT_ID]),
    GasRequestError,
  );
  assert.throws(
    () => verifyGasSignedTransaction(
      buildSignedTransaction({ signer: testKeypair(8) }).xdr,
      [ALLOWED_CONTRACT_ID],
    ),
    (error: unknown) => error instanceof GasRequestError && error.code === "wallet_signature_required",
  );
  assert.throws(
    () => verifyGasSignedTransaction(
      buildSignedTransaction({ operations: 2 }).xdr,
      [ALLOWED_CONTRACT_ID],
    ),
    /exactly one Soroban/,
  );

  const feeSource = testKeypair(9);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    feeSource.publicKey(),
    BASE_FEE,
    signed.transaction,
    Networks.TESTNET,
  );
  feeBump.sign(feeSource);
  assert.ok(feeBump instanceof FeeBumpTransaction);
  assert.throws(
    () => verifyGasSignedTransaction(feeBump.toXDR(), [ALLOWED_CONTRACT_ID]),
    /user's signed inner transaction/,
  );
});

test("authorizes the signed wallet before creating or sponsoring an operation", async () => {
  const store = new MemoryGasOperationStore();
  let veloFactoryCalls = 0;
  const signed = buildSignedTransaction();
  const service = new GasStationService(
    store,
    () => {
      veloFactoryCalls += 1;
      return createVeloFactory()();
    },
    [ALLOWED_CONTRACT_ID],
  );

  await assert.rejects(
    service.sponsorAndSubmit(randomUUID(), signed.xdr, testKeypair(8).publicKey()),
    (error: unknown) => error instanceof GasRequestError && error.code === "operation_owner_mismatch",
  );
  assert.equal(veloFactoryCalls, 0);
  assert.equal(store.rows.size, 0);
});

test("sponsorAndSubmit uses a stable idempotency key, hands off once, and preserves unresolved fee state", async () => {
  const signed = buildSignedTransaction();
  const store = new MemoryGasOperationStore();
  const service = createService(store);
  const operationId = randomUUID();
  const submitResult = makeGasResult(
    signed.transaction.hash().toString("hex"),
    "submitted",
    { actualFeeStroops: null, reconciliationRequired: true },
  );

  const { result, calls } = await withMockVeloTransport(
    signed,
    { submitResult },
    async () => service.sponsorAndSubmit(operationId, signed.xdr, signed.source.publicKey()),
  );

  const sponsorCall = calls.find((call) => call.url.pathname === "/api/gas/sponsor");
  const submitCalls = calls.filter(
    (call) =>
      call.url.pathname === "/api/gas/submit" &&
      typeof call.body.transactionXdr === "string",
  );

  assert.equal(sponsorCall?.body.transactionXdr, signed.xdr);
  assert.equal(new Headers(sponsorCall?.init.headers).get("idempotency-key"), "talambag-gas:" + operationId);
  assert.equal(submitCalls.length, 1);
  assert.equal(submitCalls[0]?.body.transactionXdr, signed.xdr);
  assert.equal(result.status, "submitted");
  assert.equal(result.actualFeeStroops, null);
  assert.equal(result.transactionHash, signed.transaction.hash().toString("hex"));
  assert.equal(result.outerTransactionHash, OUTER_HASH);
  assert.equal("transactionXdr" in result, false);
  assert.equal(store.rows.get(operationId)?.status, "submitted");
});

test("operation replay observes identity only and never submits the signed XDR again", async () => {
  const signed = buildSignedTransaction();
  const store = new MemoryGasOperationStore();
  const service = createService(store);
  const operationId = randomUUID();
  const innerHash = signed.transaction.hash().toString("hex");
  const firstResult = makeGasResult(innerHash, "submitted");
  const recoveredResult = makeGasResult(innerHash, "succeeded");

  await withMockVeloTransport(signed, { submitResult: firstResult }, async () =>
    service.sponsorAndSubmit(operationId, signed.xdr, signed.source.publicKey()),
  );

  const { result, calls } = await withMockVeloTransport(
    signed,
    { statusResults: [recoveredResult] },
    async () => service.sponsorAndSubmit(operationId, signed.xdr, signed.source.publicKey()),
  );

  const statusCalls = calls.filter((call) => call.url.pathname === "/api/gas/submit");
  assert.equal(calls.some((call) => call.url.pathname === "/api/gas/sponsor"), false);
  assert.equal(statusCalls.length, 1);
  assert.deepEqual(Object.keys(statusCalls[0]!.body).sort(), ["requestId", "transactionHash"]);
  assert.equal(result.status, "succeeded");
  assert.equal(store.rows.get(operationId)?.status, "succeeded");
});

test("uncertain handoff stores the safe identity and recovers without a second XDR handoff", async () => {
  const signed = buildSignedTransaction();
  const store = new MemoryGasOperationStore();
  const service = createService(store);
  const operationId = randomUUID();
  const innerHash = signed.transaction.hash().toString("hex");
  const unknown = makeGasResult(innerHash, "submission_unknown", {
    outerTransactionHash: null,
    reconciliationRequired: true,
  });

  const { result, calls } = await withMockVeloTransport(
    signed,
    { failSubmit: true, statusResults: [unknown] },
    async () => service.sponsorAndSubmit(operationId, signed.xdr, signed.source.publicKey()),
  );

  const xdrHandoffs = calls.filter(
    (call) =>
      call.url.pathname === "/api/gas/submit" &&
      typeof call.body.transactionXdr === "string",
  );
  const statusCalls = calls.filter(
    (call) => call.url.pathname === "/api/gas/submit" && typeof call.body.transactionXdr !== "string",
  );

  assert.equal(xdrHandoffs.length, 1);
  assert.equal(statusCalls.length, 1);
  assert.deepEqual(Object.keys(statusCalls[0]!.body).sort(), ["requestId", "transactionHash"]);
  assert.equal(result.status, "submission_unknown");
  assert.equal(result.actualFeeStroops, null);
  assert.equal(store.rows.get(operationId)?.requestId, REQUEST_ID);
  assert.equal(store.rows.get(operationId)?.transactionHash, innerHash);
});

test("a durable claim without a Velo identity is never submitted a second time", async () => {
  const signed = buildSignedTransaction();
  const store = new MemoryGasOperationStore();
  const operationId = randomUUID();
  await store.create({
    operationId,
    walletAddress: signed.source.publicKey(),
    transactionHash: signed.transaction.hash().toString("hex"),
  });
  let veloFactoryCalls = 0;
  const service = new GasStationService(
    store,
    () => {
      veloFactoryCalls += 1;
      return createVeloFactory()();
    },
    [ALLOWED_CONTRACT_ID],
  );

  const result = await service.sponsorAndSubmit(operationId, signed.xdr, signed.source.publicKey());
  assert.equal(result.status, "pending");
  assert.equal(veloFactoryCalls, 0);
});

test("status-only observation is bounded and keeps terminal failure distinct from success", async () => {
  const signed = buildSignedTransaction();
  const store = new MemoryGasOperationStore();
  const service = createService(store);
  const operationId = randomUUID();
  const innerHash = signed.transaction.hash().toString("hex");

  await store.create({
    operationId,
    walletAddress: signed.source.publicKey(),
    transactionHash: innerHash,
  });
  await store.update(operationId, {
    requestId: REQUEST_ID,
    status: "submitted",
    outerTransactionHash: OUTER_HASH,
    reservedStroops: "120",
    reconciliationRequired: true,
  });

  const failed = makeGasResult(innerHash, "failed");
  const { result, calls } = await withMockVeloTransport(
    signed,
    { statusResults: [failed] },
    async () => service.getStatus(operationId, signed.source.publicKey(), true),
  );

  assert.equal(result.status, "failed");
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]!.body).sort(), ["requestId", "transactionHash"]);
  assert.equal("transactionXdr" in result, false);
  assert.equal(result.actualFeeStroops, null);
});


test("policy denials are terminal and are not retried or marked for reconciliation", async () => {
  const signed = buildSignedTransaction();
  const store = new MemoryGasOperationStore();
  const service = createService(store);
  const operationId = randomUUID();

  const { result, calls } = await withMockVeloTransport(
    signed,
    { sponsorFailure: { status: 403, code: "contract_not_whitelisted" } },
    async () => service.sponsorAndSubmit(operationId, signed.xdr, signed.source.publicKey()),
  );

  assert.equal(result.status, "denied");
  assert.equal(result.errorCode, "contract_not_whitelisted");
  assert.equal(result.reconciliationRequired, false);
  assert.equal(calls.filter((call) => call.url.pathname === "/api/gas/sponsor").length, 1);
  assert.equal(calls.some((call) => call.url.pathname === "/api/gas/submit"), false);
  assert.equal(store.rows.get(operationId)?.status, "denied");
});
