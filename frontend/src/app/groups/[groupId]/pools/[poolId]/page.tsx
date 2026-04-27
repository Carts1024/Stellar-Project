"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/contexts/wallet-context";
import { FeedbackBanner } from "@/components/feedback-banner";
import { DepositModal } from "@/components/deposit-modal";
import { appConfig } from "@/lib/config";
import { formatAmount, parseAmountToInt, shortenAddress } from "@/lib/format";
import {
  appendUniquePoolEvent,
  fetchContractEvents,
  invalidatePoolCachesForEvent,
  subscribeToContractEvents,
  toPoolEvent,
  toPoolEvents,
} from "@/lib/realtime-events";
import {
  claimGroupRewards,
  getRewardSnapshot,
  invalidateRewardSnapshotCaches,
} from "@/lib/rewards-client";
import {
  getContractSnapshot,
  withdrawFromPool,
  TxError,
} from "@/lib/talambag-client";
import { isValidStellarAddress, parsePositiveIntegerParam } from "@/lib/validators";
import {
  POOL_ACTIVITY_REALTIME_EVENT_TYPES,
  type GroupSummary,
  type PoolEvent,
  type PoolSummary,
  type RewardSnapshot,
  type TxFeedback,
} from "@/lib/types";

export default function PoolPage() {
  const params = useParams();
  const groupId = parsePositiveIntegerParam(params.groupId);
  const poolId = parsePositiveIntegerParam(params.poolId);
  const { wallet } = useWallet();

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [rewardSnapshot, setRewardSnapshot] = useState<RewardSnapshot | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [events, setEvents] = useState<PoolEvent[]>([]);
  const [isLoading, setIsLoading] = useState(groupId !== null && poolId !== null);
  const [eventsLoading, setEventsLoading] = useState(groupId !== null && poolId !== null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Withdraw form state
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClaimingRewards, setIsClaimingRewards] = useState(false);

  const isOrganizer = wallet.address !== null && pool !== null && wallet.address === pool.organizer;
  const isValidRecipient = withdrawRecipient.trim() ? isValidStellarAddress(withdrawRecipient) : false;
  const rewardDecimals = rewardSnapshot?.metadata?.decimals ?? appConfig.assetDecimals;
  const rewardSymbol = rewardSnapshot?.metadata?.symbol ?? "TLMBG";

  const loadPool = useCallback(
    async (
      {
        showEventsLoading = true,
        showLoading = true,
      }: { showEventsLoading?: boolean; showLoading?: boolean } = {},
    ) => {
      if (groupId === null || poolId === null) {
        setGroup(null);
        setPool(null);
        setRewardSnapshot(null);
        setIsMember(false);
        setEvents([]);
        setIsLoading(false);
        setEventsLoading(false);
        return;
      }

      if (showLoading) {
        setIsLoading(true);
      }

      if (showEventsLoading) {
        setEventsLoading(true);
      }

      try {
        const [snapshot, realtimeEvents, rewards] = await Promise.all([
          getContractSnapshot(groupId, poolId, wallet.address),
          fetchContractEvents({
            eventTypes: POOL_ACTIVITY_REALTIME_EVENT_TYPES,
            groupId,
            limit: 200,
            poolId,
          }),
          getRewardSnapshot(wallet.address, groupId),
        ]);

        if (snapshot.group) setGroup(snapshot.group);
        if (snapshot.pool) setPool(snapshot.pool);
        setIsMember(snapshot.isWalletMember === true);
        setRewardSnapshot(rewards);

        if (snapshot.error) {
          setFeedback({ state: "error", title: "Load error", detail: snapshot.error });
        }

        setEvents(toPoolEvents(realtimeEvents));
      } catch (error) {
        setFeedback({
          state: "error",
          title: "Error",
          detail: error instanceof Error ? error.message : "Failed to load pool.",
        });
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }

        if (showEventsLoading) {
          setEventsLoading(false);
        }
      }
    },
    [groupId, poolId, wallet.address],
  );

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void loadPool({ showEventsLoading: false, showLoading: false });
    }, 250);
  }, [loadPool]);

  useEffect(() => {
    if (groupId !== null && poolId !== null) {
      void loadPool();
      return;
    }

    setGroup(null);
    setPool(null);
    setRewardSnapshot(null);
    setIsMember(false);
    setEvents([]);
    setIsLoading(false);
    setEventsLoading(false);
  }, [groupId, poolId, loadPool]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (groupId === null || poolId === null) {
      return;
    }

    return subscribeToContractEvents(
      { eventTypes: POOL_ACTIVITY_REALTIME_EVENT_TYPES, groupId, poolId },
      (event) => {
        if (event.type !== "deposit" && event.type !== "withdraw") {
          return;
        }

        invalidatePoolCachesForEvent(event);

        if (wallet.address && event.type === "deposit" && event.actor === wallet.address) {
          invalidateRewardSnapshotCaches(groupId, wallet.address);
        }

        setEvents((current) => appendUniquePoolEvent(current, toPoolEvent(event)));
        scheduleRealtimeRefresh();
      },
    );
  }, [groupId, poolId, scheduleRealtimeRefresh, wallet.address]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address || !pool || groupId === null || poolId === null) return;

    setIsWithdrawing(true);
    setFeedback({
      state: "signing",
      title: "Awaiting organizer signature",
      detail: "Your selected wallet will confirm the pool withdrawal.",
    });

    try {
      const amount = parseAmountToInt(withdrawAmount, appConfig.assetDecimals);
      const result = await withdrawFromPool(
        wallet.address,
        groupId,
        poolId,
        withdrawRecipient.trim(),
        amount,
        () =>
          setFeedback({
            state: "submitting",
            title: "Transaction broadcast",
            detail: "Waiting for on-chain confirmation...",
          }),
      );

      setFeedback({
        state: "success",
        title: "Withdrawal submitted",
        detail: "The transfer has been sent from the pool.",
        hash: result.hash,
      });

      setWithdrawAmount("");
      setWithdrawRecipient("");
      void loadPool({ showEventsLoading: false, showLoading: false });
    } catch (error) {
      const isRejected = error instanceof TxError && error.kind === "rejected";
      setFeedback({
        state: isRejected ? "rejected" : "error",
        title: isRejected ? "Withdrawal canceled" : "Withdrawal failed",
        detail: error instanceof Error ? error.message : "The withdrawal could not be submitted.",
      });
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function handleClaimRewards() {
    if (!wallet.address || groupId === null) return;

    setIsClaimingRewards(true);
    setFeedback({
      state: "signing",
      title: "Awaiting rewards claim signature",
      detail: "Your selected wallet will confirm the reward-token claim.",
    });

    try {
      const result = await claimGroupRewards(wallet.address, groupId, () =>
        setFeedback({
          state: "submitting",
          title: "Claim submitted",
          detail: "Waiting for the rewards contract to mint your tokens on-chain...",
        }),
      );

      setFeedback({
        state: "success",
        title: "Rewards claimed",
        detail: `${rewardSymbol} has been minted to your connected wallet.`,
        hash: result.hash,
      });

      void loadPool({ showEventsLoading: false, showLoading: false });
    } catch (error) {
      const isRejected = error instanceof TxError && error.kind === "rejected";
      setFeedback({
        state: isRejected ? "rejected" : "error",
        title: isRejected ? "Claim canceled" : "Claim failed",
        detail: error instanceof Error ? error.message : "The rewards claim could not be submitted.",
      });
    } finally {
      setIsClaimingRewards(false);
    }
  }

  if (isLoading) {
    return (
      <div className="loading-state">
        <span className="spinner" aria-hidden="true" />
        Loading pool...
      </div>
    );
  }

  if (groupId === null || poolId === null) {
    return (
      <>
        <Link href="/" className="back-link">&larr; Back to dashboard</Link>
        <div className="empty-state">
          <h3>Invalid pool URL</h3>
          <p>Use valid positive group and pool IDs in the URL.</p>
        </div>
      </>
    );
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

      {rewardSnapshot ? (
        <section className="withdraw-section">
          <div className="card-head">
            <span className="card-kicker">{rewardSnapshot.metadata?.name ?? "Rewards"}</span>
            <h2>Contribution rewards</h2>
          </div>
          <p className="card-copy">
            Deposits in this group accrue claimable reward tokens. Claiming calls the rewards
            contract, which verifies your Talambag membership before minting tokens.
          </p>
          <div className="pool-info-header">
            <article className="metric-card">
              <span className="metric-label">Pending claim</span>
              <strong className="metric-value">
                {formatAmount(rewardSnapshot.pendingReward, rewardDecimals)} {rewardSymbol}
              </strong>
              <span className="metric-detail">Ready to mint</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Wallet balance</span>
              <strong className="metric-value">
                {formatAmount(rewardSnapshot.balance, rewardDecimals)} {rewardSymbol}
              </strong>
              <span className="metric-detail">Claimed reward tokens</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Your contribution</span>
              <strong className="metric-value">
                {formatAmount(rewardSnapshot.contributedAmount, rewardDecimals)} {rewardSymbol}
              </strong>
              <span className="metric-detail">Reward-weighted contribution total</span>
            </article>
            <article className="metric-card">
              <span className="metric-label">Token supply</span>
              <strong className="metric-value">
                {formatAmount(rewardSnapshot.totalSupply, rewardDecimals)} {rewardSymbol}
              </strong>
              <span className="metric-detail">Minted across Talambag</span>
            </article>
          </div>
          {rewardSnapshot.error ? <p className="field-hint error-text">{rewardSnapshot.error}</p> : null}
          <div className="page-header-actions">
            <button
              className="primary-button"
              onClick={() => void handleClaimRewards()}
              disabled={
                isClaimingRewards ||
                !wallet.address ||
                !wallet.isExpectedNetwork ||
                !isMember ||
                rewardSnapshot.pendingReward <= 0n ||
                rewardSnapshot.status === "error"
              }
            >
              {isClaimingRewards ? "Claiming..." : `Claim ${rewardSymbol}`}
            </button>
          </div>
        </section>
      ) : null}

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
        {eventsLoading ? (
          <div className="loading-state">
            <span className="spinner" aria-hidden="true" />
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <h3>No events recorded yet</h3>
            <p>
              Deposit and withdrawal events will appear here after the first transaction on this
              pool. Only events from the last ~7 days are available via the RPC node.
            </p>
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
                {events.map((event, i) => {
                  const explorerHref = event.txHash
                    ? `${appConfig.explorerUrl}/tx/${event.txHash}`
                    : undefined;

                  return (
                    <tr
                      key={i}
                      className={explorerHref ? "tx-row tx-row--clickable" : "tx-row"}
                      onClick={
                        explorerHref
                          ? () => window.open(explorerHref, "_blank", "noreferrer")
                          : undefined
                      }
                      onKeyDown={
                        explorerHref
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                window.open(explorerHref, "_blank", "noreferrer");
                              }
                            }
                          : undefined
                      }
                      tabIndex={explorerHref ? 0 : undefined}
                      role={explorerHref ? "link" : undefined}
                      aria-label={
                        explorerHref
                          ? `View ${event.type} transaction on Stellar Expert`
                          : undefined
                      }
                    >
                      <td data-label="Type">
                        <span className={`tx-badge ${event.type}`}>{event.type}</span>
                      </td>
                      <td data-label="From">{shortenAddress(event.from)}</td>
                      <td data-label="To">{event.to ? shortenAddress(event.to) : "—"}</td>
                      <td data-label="Amount">
                        {formatAmount(event.amount, appConfig.assetDecimals)} {appConfig.assetCode}
                      </td>
                      <td data-label="Date">
                        {event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DepositModal
        open={showDeposit}
        onClose={() => setShowDeposit(false)}
        onDeposited={() => void loadPool({ showEventsLoading: false, showLoading: false })}
        groupId={groupId}
        poolId={poolId}
        onSuccessFeedback={setFeedback}
      />
    </>
  );
}
