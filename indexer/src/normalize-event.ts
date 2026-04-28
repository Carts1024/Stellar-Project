import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { indexerConfig } from "./config.js";
import type { JsonValue, NormalizedContractEvent, RpcEventRecord } from "./types.js";

function decodeScVal(encoded: string) {
  return scValToNative(xdr.ScVal.fromXDR(encoded, "base64"));
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Address) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [String(key), toJsonValue(entry)]),
    );
  }

  if (value && typeof value === "object") {
    if ("toString" in value && typeof value.toString === "function") {
      const stringValue = value.toString();
      if (stringValue !== "[object Object]") {
        return stringValue;
      }
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, toJsonValue(entry)]),
    );
  }

  return String(value);
}

function toAddress(value: unknown) {
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

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toAmount(value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number") {
    return Math.trunc(value).toString();
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

export function normalizeRpcEvent(event: RpcEventRecord): NormalizedContractEvent | null {
  const topics = event.topic.map((segment) => decodeScVal(segment));
  const payload = decodeScVal(event.value);
  const eventType = String(topics[0] ?? "unknown");
  const source =
    event.contractId === indexerConfig.INDEXER_CORE_CONTRACT_ID ? "core" : "rewards";

  let actor: string | null = null;
  let recipient: string | null = null;
  let groupId: number | null = toNumber(topics[1]);
  let poolId: number | null = toNumber(topics[2]);
  let amount: string | null = null;

  if (source === "core" && eventType === "deposit" && Array.isArray(payload)) {
    actor = toAddress(payload[0]);
    amount = toAmount(payload[1]);
  } else if (source === "core" && eventType === "withdraw" && Array.isArray(payload)) {
    actor = toAddress(payload[0]);
    recipient = toAddress(payload[1]);
    amount = toAmount(payload[2]);
  } else if (source === "core" && eventType === "group_created" && Array.isArray(payload)) {
    actor = toAddress(payload[0]);
  } else if (source === "core" && eventType === "member_added") {
    actor = toAddress(payload);
    poolId = null;
  } else if (source === "core" && eventType === "pool_created") {
    actor = toAddress(payload);
  } else if (source === "rewards" && eventType === "reward_group_registered") {
    actor = toAddress(payload);
    poolId = null;
  } else if (source === "rewards" && eventType === "reward_pending" && Array.isArray(payload)) {
    actor = toAddress(payload[0]);
    amount = toAmount(payload[1]);
    poolId = null;
  } else if (source === "rewards" && eventType === "reward_claimed" && Array.isArray(payload)) {
    actor = toAddress(payload[0]);
    amount = toAmount(payload[1]);
    poolId = null;
  } else if (source === "rewards" && eventType === "reward_transfer" && Array.isArray(payload)) {
    actor = toAddress(payload[0]);
    recipient = toAddress(payload[1]);
    amount = toAmount(payload[2]);
    groupId = null;
    poolId = null;
  } else if (source === "rewards" && eventType === "reward_burned" && Array.isArray(payload)) {
    actor = toAddress(payload[0]);
    amount = toAmount(payload[1]);
    groupId = null;
    poolId = null;
  }

  return {
    eventId: event.id,
    cursor: event.cursor ?? event.pagingToken ?? event.id,
    contractId: event.contractId,
    source,
    eventType,
    groupId,
    poolId,
    actor,
    recipient,
    amount,
    txHash: event.txHash,
    ledger: event.ledger,
    occurredAt: event.ledgerClosedAt,
    payload: toJsonValue(payload),
  };
}