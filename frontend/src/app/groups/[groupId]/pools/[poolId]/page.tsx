"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/contexts/wallet-context";
import { FeedbackBanner } from "@/components/feedback-banner";
import { DepositModal } from "@/components/deposit-modal";
import { appConfig } from "@/lib/config";
import { formatAmount, parseAmountToInt, shortenAddress } from "@/lib/format";
import {
  fetchPoolEvents,
  getContractSnapshot,
  withdrawFromPool,
} from "@/lib/talambag-client";
import { isValidStellarAddress } from "@/lib/validators";
import type { GroupSummary, PoolEvent, PoolSummary, TxFeedback } from "@/lib/types";

export default function PoolPage() {
  const params = useParams();
  const groupId = Number(params.groupId);
  const poolId = Number(params.poolId);
  const { wallet } = useWallet();

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeposit, setShowDeposit] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });

  // Withdraw form state
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const isOrganizer = wallet.address !== null && pool !== null && wallet.address === pool.organizer;
  const isValidRecipient = withdrawRecipient.trim() ? isValidStellarAddress(withdrawRecipient) : false;

  const loadPool = useCallback(async () => {
    setIsLoading(true);
    try {
      const snapshot = await getContractSnapshot(groupId, poolId, wallet.address);
      if (snapshot.group) setGroup(snapshot.group);
      if (snapshot.pool) setPool(snapshot.pool);
      setIsMember(snapshot.isWalletMember === true);

      if (snapshot.error) {
        setFeedback({ state: "error", title: "Load error", detail: snapshot.error });
      }

      const poolEvents = await fetchPoolEvents(groupId, poolId);
      setEvents(poolEvents);
    } catch (error) {
      setFeedback({
        state: "error",
        title: "Error",
        detail: error instanceof Error ? error.message : "Failed to load pool.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [groupId, poolId, wallet.address]);

  useEffect(() => {
    if (groupId && poolId) void loadPool();
  }, [groupId, poolId, loadPool]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address || !pool) return;

    setIsWithdrawing(true);
    setFeedback({
      state: "signing",
      title: "Awaiting organizer signature",
      detail: "Freighter will confirm the pool withdrawal.",
    });

    try {
      const amount = parseAmountToInt(withdrawAmount, appConfig.assetDecimals);
      const result = await withdrawFromPool(
        wallet.address,
        groupId,
        poolId,
        withdrawRecipient.trim(),
        amount,
      );

      setFeedback({
        state: "success",
        title: "Withdrawal submitted",
        detail: "The transfer has been sent from the pool.",
        hash: result.hash,
      });

      setWithdrawAmount("");
      setWithdrawRecipient("");
      void loadPool();
    } catch (error) {
      setFeedback({
        state: "error",
        title: "Withdrawal failed",
        detail: error instanceof Error ? error.message : "The withdrawal could not be submitted.",
      });
    } finally {
      setIsWithdrawing(false);
    }
  }

  if (isLoading) {
    return <div className="loading-state">Loading pool...</div>;
  }

  if (!pool) {
    return (
      <>
        <Link href={`/groups/${groupId}`} className="back-link">&larr; Back to group</Link>
        <div className="empty-state">
          <h3>Pool not found</h3>
          <p>Pool #{poolId} does not exist in group #{groupId}.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Link href={`/groups/${groupId}`} className="back-link">
        &larr; Back to {group?.name ?? `group #${groupId}`}
      </Link>

      <div className="page-header">
        <div>
          <span className="eyebrow">Pool #{pool.id} in group #{groupId}</span>
          <h1>{pool.name}</h1>
        </div>
        <div className="page-header-actions">
          {isMember && (
            <button className="primary-button" onClick={() => setShowDeposit(true)}>
              Deposit {appConfig.assetCode}
            </button>
          )}
        </div>
      </div>

      <section className="pool-info-header">
        <article className="metric-card spotlight">
          <span className="metric-label">Pool balance</span>
          <strong className="metric-value">
            {formatAmount(pool.balance, appConfig.assetDecimals)} {appConfig.assetCode}
          </strong>
          <span className="metric-detail">Current on-chain balance</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Organizer</span>
          <strong className="metric-value address">{shortenAddress(pool.organizer)}</strong>
          <span className="metric-detail">
            <button
              className="inline-link"
              onClick={() => void navigator.clipboard.writeText(pool.organizer)}
            >
              Copy address
            </button>
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Group</span>
          <strong className="metric-value address">{group?.name ?? `#${groupId}`}</strong>
          <span className="metric-detail">
            {group ? `${group.memberCount} member(s)` : ""}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Your status</span>
          <strong className="metric-value address">
            {!wallet.address ? "Not connected" : isOrganizer ? "Organizer" : isMember ? "Member" : "Not a member"}
          </strong>
          <span className="metric-detail">
            {isOrganizer ? "You can withdraw funds" : isMember ? "You can deposit" : "View only"}
          </span>
        </article>
      </section>

      <FeedbackBanner feedback={feedback} />

      <a
        href={`${appConfig.explorerUrl}/contract/${appConfig.contractId}`}
        target="_blank"
        rel="noreferrer"
        className="explorer-link"
      >
        View contract on Stellar Expert &rarr;
      </a>

      {/* Withdraw Section — organizer only */}
      {isOrganizer && (
        <section className="withdraw-section">
          <div className="card-head">
            <span className="card-kicker">Organizer withdrawal</span>
            <h2>Withdraw from this pool</h2>
          </div>
          <p className="card-copy">
            Transfer funds out to a recipient address. Only you as the pool organizer can do this.
          </p>
          <form className="stack-form" onSubmit={(e) => void handleWithdraw(e)}>
            <label>
              Recipient address
              <input
                type="text"
                value={withdrawRecipient}
                onChange={(e) => setWithdrawRecipient(e.target.value)}
                placeholder="G..."
              />
            </label>
            {withdrawRecipient.trim() && !isValidRecipient ? (
              <p className="field-hint error-text">Enter a valid Stellar address.</p>
            ) : null}
            <label>
              Amount
              <input
                type="text"
                inputMode="decimal"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder={`0.00 ${appConfig.assetCode}`}
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={
                isWithdrawing ||
                !wallet.isExpectedNetwork ||
                !withdrawAmount.trim() ||
                !isValidRecipient
              }
            >
              {isWithdrawing ? "Submitting..." : "Withdraw from pool"}
            </button>
          </form>
        </section>
      )}

      {/* Transaction History */}
      <section style={{ marginTop: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1.35rem" }}>Transaction History</h2>
        {events.length === 0 ? (
          <div className="empty-state">
            <h3>No transactions yet</h3>
            <p>Deposit and withdrawal events will appear here.</p>
          </div>
        ) : (
          <div className="tx-table-wrapper">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, i) => (
                  <tr key={i}>
                    <td>
                      <span className={`tx-badge ${event.type}`}>{event.type}</span>
                    </td>
                    <td>{shortenAddress(event.from)}</td>
                    <td>{event.to ? shortenAddress(event.to) : "—"}</td>
                    <td>
                      {formatAmount(event.amount, appConfig.assetDecimals)} {appConfig.assetCode}
                    </td>
                    <td>{event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DepositModal
        open={showDeposit}
        onClose={() => setShowDeposit(false)}
        onDeposited={() => void loadPool()}
        groupId={groupId}
        poolId={poolId}
      />
    </>
  );
}
