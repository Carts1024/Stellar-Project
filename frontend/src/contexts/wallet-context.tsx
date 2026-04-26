"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWalletKit } from "@/hooks/use-wallet-kit";
import type { WalletSnapshot } from "@/lib/types";

type WalletContextValue = {
  wallet: WalletSnapshot;
  connectWallet: () => Promise<WalletSnapshot>;
  disconnectWallet: () => Promise<void>;
  refreshWallet: () => Promise<WalletSnapshot>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const value = useWalletKit();
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
