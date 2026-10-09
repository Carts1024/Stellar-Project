"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/contexts/wallet-context";
import {
  getGasOperationStatus,
  getPendingGasOperationIds,
  type GasOperationResult,
} from "@/lib/gas-client";

export function GasRecoveryNotice() {
  const { wallet } = useWallet();
  const [operationIds, setOperationIds] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, GasOperationResult>>({});
  const [isChecking, setIsChecking] = useState(false);

  const refreshOperationIds = useCallback(() => {
    if (wallet.address) {
      setOperationIds(getPendingGasOperationIds(wallet.address));
    } else {
      setOperationIds([]);
    }
  }, [wallet.address]);

  useEffect(() => {
    refreshOperationIds();
    window.addEventListener("storage", refreshOperationIds);
    window.addEventListener("talambag:gas-operation-updated", refreshOperationIds);
    return () => {
      window.removeEventListener("storage", refreshOperationIds);
      window.removeEventListener("talambag:gas-operation-updated", refreshOperationIds);
    };
  }, [refreshOperationIds]);

  async function checkPendingOperations() {
    if (wallet.status !== "connected" || !wallet.address || wallet.isCached || isChecking) return;
    setIsChecking(true);
    try {
      const nextResults: Record<string, GasOperationResult> = {};
      for (const operationId of operationIds.slice(0, 5)) {
        try {
          nextResults[operationId] = await getGasOperationStatus(operationId, wallet.address, true);
        } catch {
          // Keep unresolved operations listed for another user initiated check.
        }
      }
      setResults((current) => ({ ...current, ...nextResults }));
      refreshOperationIds();
    } finally {
      setIsChecking(false);
    }
  }

  if (operationIds.length === 0) return null;

  return (
    <section className="notice-card warning gas-recovery-card" aria-live="polite">
      <div>
        <h2>Sponsored transaction status</h2>
        <p>
          {operationIds.length} operation{operationIds.length === 1 ? "" : "s"} still need confirmation.
          Checking uses the saved operation identity; it does not resubmit a transaction.
        </p>
        {operationIds.slice(0, 5).map((operationId) => {
          const result = results[operationId];
          return (
            <p className="gas-recovery-item" key={operationId}>
              {result
                ? "Operation " + operationId.slice(0, 8) + "…: " + result.status
                : "Operation " + operationId.slice(0, 8) + "…: awaiting status"}
              {result?.actualFeeStroops === null ? " · actual fee unknown" : ""}
            </p>
          );
        })}
      </div>
      <button
        type="button"
        className="ghost-button"
        onClick={() => void checkPendingOperations()}
        disabled={isChecking || wallet.status !== "connected" || !wallet.address || wallet.isCached}
      >
        {isChecking ? "Checking..." : "Check status"}
      </button>
    </section>
  );
}
