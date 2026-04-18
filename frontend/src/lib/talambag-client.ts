"use client";

import {
  Address,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { appConfig, getExpectedNetworkPassphrase, hasRequiredConfig } from "@/lib/config";
import { signWithFreighter } from "@/lib/freighter";
import type { ContractSnapshot, GroupSummary, PoolEvent, PoolSummary } from "@/lib/types";

type ContractArg = {
  value: string | bigint | number;
  type: "address" | "i128" | "u32" | "string";
};

function getServer() {
  return new rpc.Server(appConfig.rpcUrl, {
    allowHttp: appConfig.rpcUrl.startsWith("http://"),
  });
}

function ensureConfigured() {
  if (!hasRequiredConfig()) {
    throw new Error("Missing contract configuration. Set the frontend environment variables first.");
  }
}

function normalizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("#1") || /Unauthorized/i.test(message)) {
    return "Only the allowed wallet can perform this action.";
  }

  if (message.includes("#2") || /AmountMustBePositive/i.test(message)) {
    return "Amount must be greater than zero.";
  }

  if (message.includes("#3") || /GroupNotFound/i.test(message)) {
    return "The selected group does not exist on-chain.";
  }

  if (message.includes("#4") || /PoolNotFound/i.test(message)) {
    return "The selected pool does not exist for this group.";
  }

  if (message.includes("#5") || /AlreadyGroupMember/i.test(message)) {
    return "That wallet is already a member of the selected group.";
  }

  if (message.includes("#6") || /NotGroupMember/i.test(message)) {
    return "Only group members can perform this action.";
  }

  if (message.includes("#7") || /InsufficientPoolBalance/i.test(message)) {
    return "This pool does not have enough balance for that withdrawal.";
  }

  if (message.includes("#8") || /NameRequired/i.test(message)) {
    return "Name is required.";
  }

  return message;
}

function buildArgs(values: ContractArg[]) {
  return values.map((entry) => nativeToScVal(entry.value, { type: entry.type }));
}

async function buildTransaction(sourceAddress: string, method: string, args: ReturnType<typeof buildArgs>) {
  const server = getServer();
  const sourceAccount = await server.getAccount(sourceAddress);

  return new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: getExpectedNetworkPassphrase(),
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: appConfig.contractId,
        function: method,
        args,
      }),
    )
    .setTimeout(30)
    .build();
}

async function simulateRead<T>(
  sourceAddress: string,
  method: string,
  args: ReturnType<typeof buildArgs>,
  transform: (value: unknown) => T,
) {
  ensureConfigured();
  const server = getServer();
  const transaction = await buildTransaction(sourceAddress, method, args);
  const simulation = await server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(normalizeError(simulation.error));
  }

  if (!simulation.result?.retval) {
    throw new Error(`Simulation for ${method} returned no value.`);
  }

  return transform(scValToNative(simulation.result.retval));
}

async function signAndSubmit<T>(
  sourceAddress: string,
  method: string,
  args: ReturnType<typeof buildArgs>,
  transformReturn?: (value: unknown) => T,
) {
  ensureConfigured();
  const server = getServer();
  const transaction = await buildTransaction(sourceAddress, method, args);
  const preparedTransaction = await server.prepareTransaction(transaction);
  const signedXdr = await signWithFreighter(preparedTransaction.toXDR(), sourceAddress);
  const signedTransaction = TransactionBuilder.fromXDR(
    signedXdr,
    getExpectedNetworkPassphrase(),
  );
  const sendResponse = await server.sendTransaction(signedTransaction);

  if (sendResponse.status !== "PENDING") {
    throw new Error(normalizeError(sendResponse.errorResult ?? sendResponse.status));
  }

  const finalResponse = await server.pollTransaction(sendResponse.hash, {
    attempts: 20,
    sleepStrategy: () => 1200,
  });

  if (finalResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new Error("Transaction was submitted but could not be found on the RPC server.");
  }

  if (finalResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(normalizeError(finalResponse.resultXdr));
  }

  return {
    hash: sendResponse.hash,
    result:
      transformReturn && finalResponse.returnValue
        ? transformReturn(scValToNative(finalResponse.returnValue))
        : undefined,
  };
}

function readRecordValue(record: unknown, keys: string[]) {
  if (!record || typeof record !== "object") {
    return undefined;
  }

  if (record instanceof Map) {
    for (const key of keys) {
      if (record.has(key)) {
        return record.get(key);
      }
    }

    return undefined;
  }

  const objectRecord = record as Record<string, unknown>;
  for (const key of keys) {
    if (key in objectRecord) {
      return objectRecord[key];
    }
  }

  return undefined;
}

function normalizeAddress(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Address) {
    return value.toString();
  }

  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  throw new Error("Unable to parse Stellar address returned by the contract.");
}

function normalizeBigInt(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string") {
    return BigInt(value);
  }

  throw new Error("Unable to parse integer value returned by the contract.");
}

function normalizeNumber(value: unknown) {
  const normalized = Number(normalizeBigInt(value));

  if (!Number.isSafeInteger(normalized)) {
    throw new Error("The contract returned an ID or count outside the supported range.");
  }

  return normalized;
}

function normalizeString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  throw new Error("Unable to parse string value returned by the contract.");
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error("Unable to parse boolean value returned by the contract.");
}

function normalizeGroup(value: unknown): GroupSummary {
  return {
    id: normalizeNumber(readRecordValue(value, ["id"])),
    name: normalizeString(readRecordValue(value, ["name"])),
    owner: normalizeAddress(readRecordValue(value, ["owner"])),
    assetAddress: normalizeAddress(readRecordValue(value, ["asset", "assetAddress"])),
    memberCount: normalizeNumber(readRecordValue(value, ["member_count", "memberCount"])),
    nextPoolId: normalizeNumber(readRecordValue(value, ["next_pool_id", "nextPoolId"])),
  };
}

function normalizePool(value: unknown): PoolSummary {
  return {
    id: normalizeNumber(readRecordValue(value, ["id"])),
    groupId: normalizeNumber(readRecordValue(value, ["group_id", "groupId"])),
    name: normalizeString(readRecordValue(value, ["name"])),
    organizer: normalizeAddress(readRecordValue(value, ["organizer"])),
    balance: normalizeBigInt(readRecordValue(value, ["balance"])),
  };
}

function getReadAddress() {
  if (!appConfig.readAddress) {
    throw new Error(
      "Set NEXT_PUBLIC_STELLAR_READ_ADDRESS to a funded testnet account so the app can simulate public contract reads.",
    );
  }

  return appConfig.readAddress;
}

async function readGroup(groupId: number) {
  return simulateRead(getReadAddress(), "group", buildArgs([{ value: groupId, type: "u32" }]), normalizeGroup);
}

async function readPool(groupId: number, poolId: number) {
  return simulateRead(
    getReadAddress(),
    "pool",
    buildArgs([
      { value: groupId, type: "u32" },
      { value: poolId, type: "u32" },
    ]),
    normalizePool,
  );
}

async function readMembership(groupId: number, walletAddress: string) {
  return simulateRead(
    getReadAddress(),
    "is_member",
    buildArgs([
      { value: groupId, type: "u32" },
      { value: walletAddress, type: "address" },
    ]),
    normalizeBoolean,
  );
}

export async function getContractSnapshot(
  groupId: number | null,
  poolId: number | null,
  walletAddress: string | null,
): Promise<ContractSnapshot> {
  ensureConfigured();

  if (groupId === null) {
    return {
      status: "idle",
      selectedGroupId: null,
      selectedPoolId: null,
      group: null,
      pool: null,
      isWalletMember: walletAddress ? false : null,
    };
  }

  try {
    const group = await readGroup(groupId);
    const isWalletMember = walletAddress ? await readMembership(groupId, walletAddress) : null;
    const pool = poolId === null ? null : await readPool(groupId, poolId);

    return {
      status: "ready",
      selectedGroupId: groupId,
      selectedPoolId: poolId,
      group,
      pool,
      isWalletMember,
    };
  } catch (error) {
    return {
      status: "error",
      selectedGroupId: groupId,
      selectedPoolId: poolId,
      group: null,
      pool: null,
      isWalletMember: walletAddress ? false : null,
      error: normalizeError(error),
    };
  }
}

export async function createGroup(owner: string, name: string, assetAddress: string) {
  const response = await signAndSubmit(
    owner,
    "create_group",
    buildArgs([
      { value: owner, type: "address" },
      { value: name, type: "string" },
      { value: assetAddress, type: "address" },
    ]),
    normalizeNumber,
  );

  return {
    hash: response.hash,
    groupId: response.result ?? null,
  };
}

export async function addGroupMember(owner: string, groupId: number, member: string) {
  return signAndSubmit(
    owner,
    "add_member",
    buildArgs([
      { value: owner, type: "address" },
      { value: groupId, type: "u32" },
      { value: member, type: "address" },
    ]),
  );
}

export async function createPool(creator: string, groupId: number, name: string) {
  const response = await signAndSubmit(
    creator,
    "create_pool",
    buildArgs([
      { value: creator, type: "address" },
      { value: groupId, type: "u32" },
      { value: name, type: "string" },
    ]),
    normalizeNumber,
  );

  return {
    hash: response.hash,
    poolId: response.result ?? null,
  };
}

export async function depositToPool(from: string, groupId: number, poolId: number, amount: bigint) {
  return signAndSubmit(
    from,
    "deposit",
    buildArgs([
      { value: from, type: "address" },
      { value: groupId, type: "u32" },
      { value: poolId, type: "u32" },
      { value: amount, type: "i128" },
    ]),
  );
}

export async function withdrawFromPool(
  organizer: string,
  groupId: number,
  poolId: number,
  to: string,
  amount: bigint,
) {
  return signAndSubmit(
    organizer,
    "withdraw",
    buildArgs([
      { value: organizer, type: "address" },
      { value: groupId, type: "u32" },
      { value: poolId, type: "u32" },
      { value: to, type: "address" },
      { value: amount, type: "i128" },
    ]),
  );
}

export async function readGroupCount() {
  return simulateRead(
    getReadAddress(),
    "group_count",
    buildArgs([]),
    normalizeNumber,
  );
}

export async function listGroups(): Promise<GroupSummary[]> {
  ensureConfigured();
  const count = await readGroupCount();
  if (count <= 1) return [];

  const results = await Promise.allSettled(
    Array.from({ length: count - 1 }, (_, i) => readGroup(i + 1)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<GroupSummary> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function listPools(groupId: number, nextPoolId: number): Promise<PoolSummary[]> {
  ensureConfigured();
  if (nextPoolId <= 1) return [];

  const results = await Promise.allSettled(
    Array.from({ length: nextPoolId - 1 }, (_, i) => readPool(groupId, i + 1)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<PoolSummary> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function fetchPoolEvents(
  groupId: number,
  poolId: number,
): Promise<PoolEvent[]> {
  ensureConfigured();

  const contractId = appConfig.contractId;

  // The public Soroban RPC at soroban-testnet.stellar.org has event-indexing gaps
  // caused by load-balanced backend nodes with different event state.
  // Stellar Expert exposes a public CORS-enabled REST API with complete event history
  // and is the reliable source for contract events on testnet/mainnet.
  const apiBase = appConfig.explorerUrl.replace(
    "https://stellar.expert/",
    "https://api.stellar.expert/",
  );
  const url = `${apiBase}/contract/${contractId}/events?limit=200&order=desc`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Event API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    _embedded: {
      records: Array<{
        id: string;
        ts: number;
        topics: string[];
        bodyXdr: string;
      }>;
    };
  };

  const events: PoolEvent[] = [];

  for (const record of json._embedded.records) {
    const [action, topicGroupId, topicPoolId] = record.topics;
    if (String(topicGroupId) !== String(groupId)) continue;
    if (String(topicPoolId) !== String(poolId)) continue;
    if (action !== "deposit" && action !== "withdraw") continue;

    const bodyScVal = xdr.ScVal.fromXDR(record.bodyXdr, "base64");
    const data = scValToNative(bodyScVal) as unknown[];
    const timestamp = new Date(record.ts * 1000).toISOString();

    if (action === "deposit") {
      events.push({
        type: "deposit",
        from: normalizeAddress(Array.isArray(data) ? data[0] : data),
        amount: normalizeBigInt(Array.isArray(data) ? data[1] : 0n),
        timestamp,
      });
    } else {
      events.push({
        type: "withdraw",
        from: normalizeAddress(Array.isArray(data) ? data[0] : data),
        to: Array.isArray(data) && data.length > 1 ? normalizeAddress(data[1]) : undefined,
        amount: normalizeBigInt(
          Array.isArray(data) && data.length > 2
            ? data[2]
            : Array.isArray(data)
              ? data[1]
              : 0n,
        ),
        timestamp,
      });
    }
  }

  // API returns records in descending order (most recent first).
  return events;
}
