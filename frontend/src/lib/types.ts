export type ContractStatus = "loading" | "uninitialized" | "ready" | "error";
export type WalletStatus = "disconnected" | "connecting" | "connected" | "unsupported";
export type TxState = "idle" | "signing" | "submitting" | "success" | "error";

export type TxFeedback = {
  state: TxState;
  title: string;
  detail?: string;
  hash?: string;
};

export type ContractSnapshot = {
  status: ContractStatus;
  organizer: string | null;
  assetAddress: string | null;
  poolBalance: bigint | null;
  error?: string;
};

export type WalletSnapshot = {
  status: WalletStatus;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  isExpectedNetwork: boolean;
  error?: string;
};
