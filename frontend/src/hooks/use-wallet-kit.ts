"use client";

import { useEffect, useState } from "react";
import {
  clearPersistedWalletSnapshot,
  persistWalletSnapshot,
  readPersistedWalletSnapshot,
} from "@/lib/pwa/wallet-persistence";
import {
  connectWalletWithKit,
  disconnectActiveWallet,
  ensureWalletKitInitialized,
  readWalletSnapshot,
  subscribeWalletKitEvents,
} from "@/lib/wallet-kit";
import type { WalletSnapshot } from "@/lib/types";

const initialWalletState: WalletSnapshot = {
  status: "disconnected",
  address: null,
  walletId: null,
  walletName: null,
  network: null,
  networkPassphrase: null,
  isExpectedNetwork: false,
  isNetworkVerified: false,
  isCached: false,
  xlmBalance: null,
};

function normalizeHookError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}

export function useWalletKit() {
  const [wallet, setWallet] = useState<WalletSnapshot>(initialWalletState);

  async function syncWallet(showConnectingState = true) {
    if (showConnectingState) {
      setWallet((current) => ({
        ...current,
        status: current.status === "unsupported" ? "unsupported" : "connecting",
      }));
    }

    try {
      await ensureWalletKitInitialized();
      const snapshot = await readWalletSnapshot();
      persistWalletSnapshot(snapshot);
      setWallet(snapshot);
      return snapshot;
    } catch (error) {
      clearPersistedWalletSnapshot();
      const fallback: WalletSnapshot = {
        ...initialWalletState,
        status: "unsupported",
        error: normalizeHookError(error, "Unable to read wallet state."),
      };

      setWallet(fallback);
      return fallback;
    }
  }

  async function connectWallet() {
    setWallet((current) => ({ ...current, status: "connecting", error: undefined }));

    try {
      const snapshot = await connectWalletWithKit();
      persistWalletSnapshot(snapshot);
      setWallet(snapshot);
      return snapshot;
    } catch (error) {
      const message = normalizeHookError(error, "Unable to connect the selected wallet.");
      const isCancellation = /cancel|cancelled|canceled|rejected|denied|closed/i.test(message);

      // Cancellations are user-initiated — reset silently with no error state.
      // Real failures surface the message so WalletStatusNotice can display it.
      setWallet(
        isCancellation
          ? initialWalletState
          : { ...initialWalletState, error: message },
      );

      if (!isCancellation) {
        clearPersistedWalletSnapshot();
        throw new Error(message);
      }

      return initialWalletState;
    }
  }

  async function disconnectWallet() {
    try {
      await disconnectActiveWallet();
    } finally {
      clearPersistedWalletSnapshot();
      setWallet(initialWalletState);
    }
  }

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    const persistedSnapshot = readPersistedWalletSnapshot();
    if (persistedSnapshot) {
      setWallet(persistedSnapshot);
    }

    async function setupWalletKit() {
      const stop = await subscribeWalletKitEvents({
        onStateUpdated: () => {
          if (isMounted) {
            void syncWallet(false);
          }
        },
        onWalletSelected: () => {
          if (isMounted) {
            void syncWallet(false);
          }
        },
        onDisconnect: () => {
          if (isMounted) {
            clearPersistedWalletSnapshot();
            setWallet(initialWalletState);
          }
        },
      });

      if (!isMounted) {
        stop();
        return;
      }

      unsubscribe = stop;
      await syncWallet(false);
    }

    void setupWalletKit();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return {
    wallet,
    connectWallet,
    disconnectWallet,
    refreshWallet: syncWallet,
  };
}