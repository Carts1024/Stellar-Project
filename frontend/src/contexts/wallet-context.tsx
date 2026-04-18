"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFreighterWallet } from "@/hooks/use-freighter-wallet";
import type { WalletSnapshot } from "@/lib/types";

type WalletContextValue = {
  wallet: WalletSnapshot;
  connectWallet: () => Promise<WalletSnapshot>;
  disconnectWallet: () => void;
  refreshWallet: () => Promise<WalletSnapshot>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const value = useFreighterWallet();
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
