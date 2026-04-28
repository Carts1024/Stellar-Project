"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/contexts/wallet-context";
import { FeedbackBanner } from "@/components/feedback-banner";
import { SearchBar } from "@/components/search-bar";
import { CreateGroupModal } from "@/components/create-group-modal";
import { formatXlmBalance, shortenAddress } from "@/lib/format";
import {
  invalidateDashboardCachesForEvent,
  subscribeToContractEvents,
} from "@/lib/realtime-events";
import { listGroups, readGroupCount } from "@/lib/talambag-client";
import {
  DASHBOARD_REALTIME_EVENT_TYPES,
  type GroupSummary,
  type TxFeedback,
} from "@/lib/types";

export default function DashboardPage() {
  const { wallet } = useWallet();
  const isWalletReady =
    wallet.status === "connected" && wallet.isExpectedNetwork && !wallet.isCached;
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadGroups = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const [fetched, count] = await Promise.all([listGroups(), readGroupCount()]);
      setGroups(fetched);
      setTotalGroups(count - 1);
    } catch {
      // leave groups empty
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void loadGroups({ showLoading: false });
    }, 250);
  }, [loadGroups]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return subscribeToContractEvents(
      { eventTypes: DASHBOARD_REALTIME_EVENT_TYPES },
      (event) => {
        invalidateDashboardCachesForEvent(event);
        scheduleRealtimeRefresh();
      },
    );
  }, [scheduleRealtimeRefresh]);

  const searchLower = search.toLowerCase().trim();
  const filteredGroups = searchLower
    ? groups.filter(
        (g) =>
          g.name.toLowerCase().includes(searchLower) ||
          g.id.toString() === searchLower,
      )
    : groups;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Group-based pooled giving on Soroban</span>
          <h1>Talambag now organizes community fundraising by group and by pool.</h1>
          <p>
            Group owners manage membership, members open new pools, and the wallet that creates
            each pool becomes its organizer. Contributions stay restricted to group members while
            balances remain transparent on-chain.
          </p>
        </div>
      </section>

      <section className="status-grid status-grid--dashboard">
        <article className="metric-card spotlight">
          <span className="metric-label">Total groups</span>
          <strong className="metric-value">{totalGroups}</strong>
          <span className="metric-detail">On-chain groups created</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Connected wallet</span>
          <strong className="metric-value address">
            {wallet.xlmBalance !== null
              ? `${formatXlmBalance(wallet.xlmBalance)} XLM`
              : shortenAddress(wallet.address)}
          </strong>
          <span className="metric-detail">
            {wallet.xlmBalance !== null
              ? shortenAddress(wallet.address)
              : wallet.network
                ? `${wallet.network}${wallet.walletName ? ` via ${wallet.walletName}` : " via connected wallet"}`
                : "Not connected"}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Network</span>
          <strong className="metric-value address">
            {isWalletReady
              ? "Connected"
              : wallet.status === "connected"
                ? wallet.isCached
                  ? "Cached"
                  : "Mismatch"
                : "--"}
          </strong>
          <span className="metric-detail">
            {isWalletReady
              ? "Ready for transactions"
              : wallet.isCached
                ? "Reconnect online to resume wallet actions"
              : wallet.status === "connected"
                ? "Switch the connected wallet to the correct network"
                : "Connect wallet to begin"}
          </span>
        </article>
      </section>

      <section className="section-block">
        <div className="page-header">
          <div>
            <h2 className="section-title section-title--large">Groups</h2>
            <p className="page-subtitle">Browse and manage community groups</p>
          </div>
          <div className="page-header-actions">
            <button
              className="primary-button"
              onClick={() => setShowCreateModal(true)}
              disabled={!isWalletReady}
            >
              Create group
            </button>
          </div>
        </div>

        <FeedbackBanner feedback={feedback} />

        <SearchBar
          value={search}
          onChange={setSearch}
          label="Search groups"
          placeholder="Search by group name or ID..."
        />

        {isLoading ? (
          <div className="loading-state">
            <span className="spinner" aria-hidden="true" />
            Loading groups...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="empty-state">
            <h3>{search ? "No groups match your search" : "No groups yet"}</h3>
            <p>{search ? "Try a different search term." : "Create the first group to get started."}</p>
          </div>
        ) : (
          <div className="list-grid">
            {filteredGroups.map((group) => (
              <Link
                key={group.id}
                href={`/groups/${group.id}`}
                className="group-card"
              >
                <span className="card-kicker">Group #{group.id}</span>
                <h3 className="card-title">{group.name}</h3>
                <div className="card-meta">
                  <span className="card-meta-item">{group.memberCount} member(s)</span>
                  <span className="card-meta-item">{group.nextPoolId - 1} pool(s)</span>
                  <span className="card-meta-item">Owner: {shortenAddress(group.owner)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <CreateGroupModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => void loadGroups()}
        onSuccessFeedback={setFeedback}
      />
    </>
  );
}
