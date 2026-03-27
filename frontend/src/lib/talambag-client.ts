"use client";

import {
  Address,
  BASE_FEE,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import { appConfig, getExpectedNetworkPassphrase, hasRequiredConfig } from "@/lib/config";
import { signWithFreighter } from "@/lib/freighter";
import type { ContractSnapshot } from "@/lib/types";

function getServer() {
  return new rpc.Server(appConfig.rpcUrl, {
    allowHttp: appConfig.rpcUrl.startsWith("http://"),
  });
}

function normalizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("#2") || /NotInitialized/i.test(message)) {
    return "The pool has not been initialized yet.";
  }

  if (message.includes("#3") || /Unauthorized/i.test(message)) {
    return "Only the verified organizer can perform this action.";
  }

  if (message.includes("#4") || /AmountMustBePositive/i.test(message)) {
    return "Amount must be greater than zero.";
  }

  return message;
}

function ensureConfigured() {
  if (!hasRequiredConfig()) {
    throw new Error("Missing contract configuration. Set the frontend environment variables first.");
  }
}

function buildArgs(values: Array<{ value: string | bigint; type: "address" | "i128" }>) {
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

async function signAndSubmit(
  sourceAddress: string,
  method: string,
  args: ReturnType<typeof buildArgs>,
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
  };
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

  return null;
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

  return 0n;
}

export async function getContractSnapshot(): Promise<ContractSnapshot> {
  ensureConfigured();

  if (!appConfig.readAddress) {
    return {
      status: "error",
      organizer: null,
      assetAddress: appConfig.assetAddress || null,
      poolBalance: null,
      error:
        "Set NEXT_PUBLIC_STELLAR_READ_ADDRESS to a funded testnet account so the app can simulate public contract reads.",
    };
  }

  try {
    const organizer = await simulateRead(appConfig.readAddress, "organizer", [], normalizeAddress);
    const poolBalance = await simulateRead(
      appConfig.readAddress,
      "pool_balance",
      [],
      normalizeBigInt,
    );

    return {
      status: "ready",
      organizer,
      assetAddress: appConfig.assetAddress || null,
      poolBalance,
    };
  } catch (error) {
    const message = normalizeError(error);

    if (message === "The pool has not been initialized yet.") {
      return {
        status: "uninitialized",
        organizer: null,
        assetAddress: appConfig.assetAddress || null,
        poolBalance: null,
      };
    }

    return {
      status: "error",
      organizer: null,
      assetAddress: appConfig.assetAddress || null,
      poolBalance: null,
      error: message,
    };
  }
}

export async function initializePool(organizer: string, assetAddress: string) {
  return signAndSubmit(organizer, "init", buildArgs([
    { value: organizer, type: "address" },
    { value: assetAddress, type: "address" },
  ]));
}

export async function depositToPool(from: string, amount: bigint) {
  return signAndSubmit(from, "deposit", buildArgs([
    { value: from, type: "address" },
    { value: amount, type: "i128" },
  ]));
}

export async function withdrawFromPool(organizer: string, to: string, amount: bigint) {
  return signAndSubmit(organizer, "withdraw", buildArgs([
    { value: organizer, type: "address" },
    { value: to, type: "address" },
    { value: amount, type: "i128" },
  ]));
}
