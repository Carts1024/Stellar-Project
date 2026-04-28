export type ContractStatus = "idle" | "loading" | "ready" | "error";
export type WalletStatus = "disconnected" | "connecting" | "connected" | "unsupported";

/** "rejected" = user explicitly canceled the wallet prompt (not an error). */
export type TxState = "idle" | "signing" | "submitting" | "success" | "rejected" | "error";

/**
 * Classifies a wallet or contract error into one of three required categories
 * (wallet_not_found, rejected, insufficient_balance) or a generic fallback.
 */
export type WalletErrorKind = "wallet_not_found" | "rejected" | "insufficient_balance" | "other";

export type TxFeedback = {
  state: TxState;
  title: string;
  detail?: string;
  hash?: string;
};

export type GroupSummary = {
  id: number;
  name: string;
  owner: string;
  assetAddress: string;
  memberCount: number;
  nextPoolId: number;
};

export type PoolSummary = {
  id: number;
  groupId: number;
  name: string;
  organizer: string;
  balance: bigint;
};

export type PoolEvent = {
  eventId?: string;
  type: "deposit" | "withdraw";
  from: string;
  to?: string;
  amount: bigint;
  timestamp: string;
  txHash?: string;
};

export const SUPPORTED_REALTIME_EVENT_TYPES = [
  "group_created",
  "member_added",
  "pool_created",
  "deposit",
  "withdraw",
] as const;

export type SupportedRealtimeEventType = (typeof SUPPORTED_REALTIME_EVENT_TYPES)[number];

export const DASHBOARD_REALTIME_EVENT_TYPES: readonly SupportedRealtimeEventType[] = [
  "group_created",
  "member_added",
  "pool_created",
];

export const GROUP_PAGE_REALTIME_EVENT_TYPES: readonly SupportedRealtimeEventType[] = [
  "member_added",
  "pool_created",
  "deposit",
  "withdraw",
];

export const POOL_ACTIVITY_REALTIME_EVENT_TYPES: readonly SupportedRealtimeEventType[] = [
  "deposit",
  "withdraw",
];

export type RealtimeEventFilters = Readonly<{
  groupId?: number;
  poolId?: number;
  eventTypes?: readonly SupportedRealtimeEventType[];
  limit?: number;
}>;

type BaseRealtimeEvent = {
  eventId?: string;
  groupId: number;
  timestamp: string;
  txHash?: string;
};

type GroupActorRealtimeEvent = BaseRealtimeEvent & {
  actor: string;
};

export type GroupCreatedRealtimeEvent = GroupActorRealtimeEvent & {
  type: "group_created";
};

export type MemberAddedRealtimeEvent = GroupActorRealtimeEvent & {
  type: "member_added";
};

export type PoolCreatedRealtimeEvent = GroupActorRealtimeEvent & {
  type: "pool_created";
  poolId: number;
};

export type DepositRealtimeEvent = GroupActorRealtimeEvent & {
  type: "deposit";
  amount: bigint;
  poolId: number;
};

export type WithdrawRealtimeEvent = GroupActorRealtimeEvent & {
  type: "withdraw";
  amount: bigint;
  poolId: number;
  recipient: string;
};

export type PoolActivityRealtimeEvent = DepositRealtimeEvent | WithdrawRealtimeEvent;

export type RealtimeContractEvent =
  | GroupCreatedRealtimeEvent
  | MemberAddedRealtimeEvent
  | PoolCreatedRealtimeEvent
  | PoolActivityRealtimeEvent;

export type ContractSnapshot = {
  status: ContractStatus;
  selectedGroupId: number | null;
  selectedPoolId: number | null;
  group: GroupSummary | null;
  pool: PoolSummary | null;
  isWalletMember: boolean | null;
  error?: string;
};

export type RewardTokenMetadata = {
  name: string;
  symbol: string;
  decimals: number;
};

export type RewardSnapshot = {
  status: ContractStatus;
  groupId: number | null;
  walletAddress: string | null;
  metadata: RewardTokenMetadata | null;
  balance: bigint;
  pendingReward: bigint;
  contributedAmount: bigint;
  totalSupply: bigint;
  error?: string;
};

export type WalletSnapshot = {
  status: WalletStatus;
  address: string | null;
  walletId: string | null;
  walletName: string | null;
  network: string | null;
  networkPassphrase: string | null;
  isExpectedNetwork: boolean;
  isNetworkVerified: boolean;
  isCached: boolean;
  xlmBalance: string | null;
  error?: string;
};
