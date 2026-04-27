"use client";

import {
  BASE_FEE,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { getCached, invalidateCached, setCached } from "@/lib/cache";
import { appConfig, getExpectedNetworkPassphrase, hasRewardsConfig } from "@/lib/config";
import { signWithActiveWallet } from "@/lib/wallet-kit";
import { TxError, classifyError } from "@/lib/talambag-client";
import type { RewardSnapshot, RewardTokenMetadata, WalletErrorKind } from "@/lib/types";

type ContractArg = {
  value: string | bigint | number;
  type: "address" | "i128" | "u32" | "string";
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isGroupNotRegisteredError(error: unknown) {
  const lower = getErrorMessage(error).toLowerCase();
  return (
    lower.includes("#4") ||
    lower.includes("groupnotregistered") ||
    lower.includes("does not know about this group yet")
  );
}

function isMissingContractFunctionError(error: unknown, method: string) {
  const lower = getErrorMessage(error).toLowerCase();
  return (
    lower.includes("trying to invoke non-existent contract function") &&
    lower.includes(method.toLowerCase())
  );
}

function getServer() {
  return new rpc.Server(appConfig.rpcUrl, {
    allowHttp: appConfig.rpcUrl.startsWith("http://"),
  });
}

function ensureRewardsConfigured() {
  if (!hasRewardsConfig()) {
    throw new Error(
      "Missing rewards contract configuration. Set NEXT_PUBLIC_TALAMBAG_REWARDS_CONTRACT_ID first.",
    );
  }
}

function normalizeRewardsError(error: unknown) {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();

  const kind = classifyError(error);
  if (kind === "wallet_not_found") {
    return "The selected wallet is not installed or not available in this browser.";
  }

  if (kind === "rejected") {
    return "The wallet request was canceled. Approve the prompt in your wallet to continue.";
  }

  if (kind === "insufficient_balance") {
    return "Insufficient balance to complete the rewards transaction.";
  }

  if (lower.includes("#4") || lower.includes("groupnotregistered")) {
    return "The rewards contract does not know about this group yet.";
  }

  if (lower.includes("#6") || lower.includes("norewardsavailable")) {
    return "There are no claimable rewards for this wallet yet.";
  }

  if (lower.includes("#7") || lower.includes("noteligible")) {
    return "Only active group members can claim rewards.";
  }

  if (lower.includes("#9") || lower.includes("corecontractnotconfigured")) {
    return "The rewards contract is not linked to the Talambag core contract yet.";
  }

  if (lower.includes("#10") || lower.includes("insufficientbalance")) {
    return "This wallet does not have enough reward tokens for that action.";
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
        contract: appConfig.rewardContractId,
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
  ensureRewardsConfigured();
  const server = getServer();
  const transaction = await buildTransaction(sourceAddress, method, args);
  const simulation = await server.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(normalizeRewardsError(simulation.error));
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
  onSubmitting?: () => void,
) {
  ensureRewardsConfigured();
  const server = getServer();
  const transaction = await buildTransaction(sourceAddress, method, args);
  const preparedTransaction = await server.prepareTransaction(transaction);

  let signedXdr: string;
  try {
    signedXdr = await signWithActiveWallet(preparedTransaction.toXDR(), sourceAddress);
  } catch (error) {
    const kind: WalletErrorKind = classifyError(error);
    throw new TxError(normalizeRewardsError(error), kind);
  }

  const signedTransaction = TransactionBuilder.fromXDR(
    signedXdr,
    getExpectedNetworkPassphrase(),
  );
  onSubmitting?.();
  const sendResponse = await server.sendTransaction(signedTransaction);

  if (sendResponse.status !== "PENDING") {
    const message = normalizeRewardsError(sendResponse.errorResult ?? sendResponse.status);
    throw new TxError(message, classifyError(message));
  }

  const finalResponse = await server.pollTransaction(sendResponse.hash, {
    attempts: 20,
    sleepStrategy: () => 1200,
  });

  if (finalResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new TxError("Transaction was submitted but could not be found on the RPC server.");
  }

  if (finalResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
    const message = normalizeRewardsError(finalResponse.resultXdr);
    throw new TxError(message, classifyError(message));
  }

  return {
    hash: sendResponse.hash,
    result:
      transformReturn && finalResponse.returnValue
        ? transformReturn(scValToNative(finalResponse.returnValue))
        : undefined,
  };
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

  throw new Error("Unable to parse integer value returned by the rewards contract.");
}

function normalizeNumber(value: unknown) {
  const normalized = Number(normalizeBigInt(value));

  if (!Number.isSafeInteger(normalized)) {
    throw new Error("The rewards contract returned a value outside the supported range.");
  }

  return normalized;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error("Unable to parse boolean value returned by the rewards contract.");
}

function normalizeString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  throw new Error("Unable to parse string value returned by the rewards contract.");
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

function normalizeMetadata(value: unknown): RewardTokenMetadata {
  return {
    name: normalizeString(readRecordValue(value, ["name"])),
    symbol: normalizeString(readRecordValue(value, ["symbol"])),
    decimals: normalizeNumber(readRecordValue(value, ["decimals"])),
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

async function readMetadata() {
  const key = "reward:metadata";
  const cached = getCached<RewardTokenMetadata>(key);
  if (cached) return cached;
  const result = await simulateRead(getReadAddress(), "metadata", buildArgs([]), normalizeMetadata);
  setCached(key, result);
  return result;
}

async function readBalance(walletAddress: string) {
  const key = `reward:balance:${walletAddress}`;
  const cached = getCached<bigint>(key);
  if (cached !== undefined) return cached;
  const result = await simulateRead(
    getReadAddress(),
    "balance",
    buildArgs([{ value: walletAddress, type: "address" }]),
    normalizeBigInt,
  );
  setCached(key, result);
  return result;
}

async function readPendingReward(groupId: number, walletAddress: string) {
  const key = `reward:pending:${groupId}:${walletAddress}`;
  const cached = getCached<bigint>(key);
  if (cached !== undefined) return cached;
  const result = await simulateRead(
    getReadAddress(),
    "pending_reward",
    buildArgs([
      { value: groupId, type: "u32" },
      { value: walletAddress, type: "address" },
    ]),
    normalizeBigInt,
  );
  setCached(key, result);
  return result;
}

async function readContributedAmount(groupId: number, walletAddress: string) {
  const key = `reward:contributed:${groupId}:${walletAddress}`;
  const cached = getCached<bigint>(key);
  if (cached !== undefined) return cached;
  const result = await simulateRead(
    getReadAddress(),
    "contributed_amount",
    buildArgs([
      { value: groupId, type: "u32" },
      { value: walletAddress, type: "address" },
    ]),
    normalizeBigInt,
  );
  setCached(key, result);
  return result;
}

async function readGroupOwner(groupId: number) {
  return simulateRead(
    getReadAddress(),
    "group_owner",
    buildArgs([{ value: groupId, type: "u32" }]),
    normalizeString,
  );
}

async function readGroupRegistration(groupId: number) {
  try {
    return await simulateRead(
      getReadAddress(),
      "is_group_registered",
      buildArgs([{ value: groupId, type: "u32" }]),
      normalizeBoolean,
    );
  } catch (error) {
    if (!isMissingContractFunctionError(error, "is_group_registered")) {
      throw error;
    }

    try {
      await readGroupOwner(groupId);
      return true;
    } catch (fallbackError) {
      if (isGroupNotRegisteredError(fallbackError)) {
        return false;
      }

      throw fallbackError;
    }
  }
}

async function readTotalSupply() {
  const key = "reward:total-supply";
  const cached = getCached<bigint>(key);
  if (cached !== undefined) return cached;
  const result = await simulateRead(getReadAddress(), "total_supply", buildArgs([]), normalizeBigInt);
  setCached(key, result);
  return result;
}

function invalidateRewardCaches(groupId: number, walletAddress: string) {
  invalidateCached(`reward:balance:${walletAddress}`);
  invalidateCached(`reward:pending:${groupId}:${walletAddress}`);
  invalidateCached(`reward:contributed:${groupId}:${walletAddress}`);
  invalidateCached("reward:total-supply");
}

export async function getRewardSnapshot(
  walletAddress: string | null,
  groupId: number | null,
): Promise<RewardSnapshot | null> {
  if (!hasRewardsConfig()) {
    return null;
  }

  try {
    const [metadata, totalSupply] = await Promise.all([readMetadata(), readTotalSupply()]);

    if (!walletAddress || groupId === null) {
      return {
        status: "ready",
        groupId,
        walletAddress,
        metadata,
        balance: 0n,
        pendingReward: 0n,
        contributedAmount: 0n,
        totalSupply,
      };
    }

    const [balance, isGroupRegistered] = await Promise.all([
      readBalance(walletAddress),
      readGroupRegistration(groupId),
    ]);

    if (!isGroupRegistered) {
      return {
        status: "ready",
        groupId,
        walletAddress,
        metadata,
        balance,
        pendingReward: 0n,
        contributedAmount: 0n,
        totalSupply,
      };
    }

    const [pendingReward, contributedAmount] = await Promise.all([
      readPendingReward(groupId, walletAddress),
      readContributedAmount(groupId, walletAddress),
    ]);

    return {
      status: "ready",
      groupId,
      walletAddress,
      metadata,
      balance,
      pendingReward,
      contributedAmount,
      totalSupply,
    };
  } catch (error) {
    return {
      status: "error",
      groupId,
      walletAddress,
      metadata: null,
      balance: 0n,
      pendingReward: 0n,
      contributedAmount: 0n,
      totalSupply: 0n,
      error: normalizeRewardsError(error),
    };
  }
}

export async function claimGroupRewards(
  walletAddress: string,
  groupId: number,
  onSubmitting?: () => void,
) {
  const response = await signAndSubmit(
    walletAddress,
    "claim_rewards",
    buildArgs([
      { value: walletAddress, type: "address" },
      { value: groupId, type: "u32" },
    ]),
    normalizeBigInt,
    onSubmitting,
  );

  invalidateRewardCaches(groupId, walletAddress);

  return {
    hash: response.hash,
    amount: response.result ?? 0n,
  };
}