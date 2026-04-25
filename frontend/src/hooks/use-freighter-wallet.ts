"use client";

import { useEffect, useState } from "react";
import { connectFreighterWallet, readFreighterWallet } from "@/lib/freighter";
import type { WalletSnapshot } from "@/lib/types";

const initialWalletState: WalletSnapshot = {
  status: "disconnected",
  address: null,
  network: null,
  networkPassphrase: null,
  isExpectedNetwork: false,
  xlmBalance: null,
};

export function useFreighterWallet() {
  const [wallet, setWallet] = useState<WalletSnapshot>(initialWalletState);

  async function refreshWallet() {
    setWallet((current) => ({ ...current, status: current.status === "unsupported" ? "unsupported" : "connecting" }));

    try {
      const snapshot = await readFreighterWallet();
      setWallet(snapshot);
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read wallet state.";
      const fallback: WalletSnapshot = {
        status: "unsupported",
        address: null,
        network: null,
        networkPassphrase: null,
        isExpectedNetwork: false,
        xlmBalance: null,
        error: message,
      };

      setWallet(fallback);
      return fallback;
    }
  }

  async function connectWallet() {
    setWallet((current) => ({ ...current, status: "connecting" }));
    const snapshot = await connectFreighterWallet();
    setWallet(snapshot);
    return snapshot;
  }

  function disconnectWallet() {
    setWallet(initialWalletState);
  }

  useEffect(() => {
    void refreshWallet();
  }, []);

  return {
    wallet,
    connectWallet,
    disconnectWallet,
    refreshWallet,
  };
}
