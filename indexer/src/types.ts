export type ContractSource = "core" | "rewards";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type NormalizedContractEvent = {
  eventId: string;
  cursor: string;
  contractId: string;
  source: ContractSource;
  eventType: string;
  groupId: number | null;
  poolId: number | null;
  actor: string | null;
  recipient: string | null;
  amount: string | null;
  txHash: string;
  ledger: number;
  occurredAt: string;
  payload: JsonValue;
};

export type RpcEventRecord = {
  contractId: string;
  cursor?: string;
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  pagingToken?: string;
  topic: string[];
  txHash: string;
  type: string;
  value: string;
};

export type RpcEventsResponse = {
  cursor?: string;
  events: RpcEventRecord[];
  latestLedger: number;
};

export type PoolEventFilters = {
  groupId?: number;
  poolId?: number;
  limit?: number;
};