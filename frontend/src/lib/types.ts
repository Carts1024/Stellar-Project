export type ContractStatus = "idle" | "loading" | "ready" | "error";
export type WalletStatus = "disconnected" | "connecting" | "connected" | "unsupported";
export type TxState = "idle" | "signing" | "submitting" | "success" | "error";

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
  type: "deposit" | "withdraw";
  from: string;
  to?: string;
  amount: bigint;
  timestamp: string;
  txHash?: string;
};

export type ContractSnapshot = {
  status: ContractStatus;
  selectedGroupId: number | null;
  selectedPoolId: number | null;
  group: GroupSummary | null;
  pool: PoolSummary | null;
  isWalletMember: boolean | null;
  error?: string;
};

export type WalletSnapshot = {
  status: WalletStatus;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  isExpectedNetwork: boolean;
  xlmBalance: string | null;
  error?: string;
};
