"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@/contexts/wallet-context";
import { SearchBar } from "@/components/search-bar";
import { FeedbackBanner } from "@/components/feedback-banner";
import { AddMemberModal } from "@/components/add-member-modal";
import { CreatePoolModal } from "@/components/create-pool-modal";
import { copyTextToClipboard } from "@/lib/clipboard";
import { appConfig } from "@/lib/config";
import { formatAmount, shortenAddress } from "@/lib/format";
import {
  invalidateGroupCachesForEvent,
  subscribeToContractEvents,
} from "@/lib/realtime-events";
import { getContractSnapshot, listPools } from "@/lib/talambag-client";
import {
  GROUP_PAGE_REALTIME_EVENT_TYPES,
  type GroupSummary,
  type PoolSummary,
  type TxFeedback,
} from "@/lib/types";
import { parsePositiveIntegerParam } from "@/lib/validators";

export default function GroupPage() {
  const params = useParams();
  const groupId = parsePositiveIntegerParam(params.groupId);
  const { wallet } = useWallet();
  const isWalletReady =
    wallet.status === "connected" && wallet.isExpectedNetwork && !wallet.isCached;

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [pools, setPools] = useState<PoolSummary[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [isLoading, setIsLoading] = useState(groupId !== null);
  const [search, setSearch] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = wallet.address !== null && group !== null && wallet.address === group.owner;

  const loadGroup = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (groupId === null) {
      setGroup(null);
      setPools([]);
      setIsMember(false);
      setIsLoading(false);
      return;
    }

    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const snapshot = await getContractSnapshot(groupId, null, wallet.address);
      if (snapshot.group) {
        setGroup(snapshot.group);
        setIsMember(snapshot.isWalletMember === true);
        const poolList = await listPools(groupId, snapshot.group.nextPoolId);
        setPools(poolList);
      } else if (snapshot.error) {
        setFeedback({ state: "error", title: "Failed to load group", detail: snapshot.error });
      }
    } catch (error) {
      setFeedback({
        state: "error",
        title: "Error",
        detail: error instanceof Error ? error.message : "Failed to load group.",
      });
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [groupId, wallet.address]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void loadGroup({ showLoading: false });
    }, 250);
  }, [loadGroup]);

  useEffect(() => {
    if (groupId !== null) {
      void loadGroup();
      return;
    }

    setGroup(null);
    setPools([]);
    setIsMember(false);
    setIsLoading(false);
  }, [groupId, loadGroup]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (groupId === null) {
      return;
    }

    return subscribeToContractEvents(
      { eventTypes: GROUP_PAGE_REALTIME_EVENT_TYPES, groupId },
      (event) => {
        invalidateGroupCachesForEvent(event);
        scheduleRealtimeRefresh();
      },
    );
  }, [groupId, scheduleRealtimeRefresh]);

  const searchLower = search.toLowerCase().trim();
  const filteredPools = searchLower
    ? pools.filter((p) => p.name.toLowerCase().includes(searchLower))
    : pools;

  if (isLoading) {
    return (
      <div className="loading-state">
        <span className="spinner" aria-hidden="true" />
        Loading group...
      </div>
    );
  }

  if (groupId === null) {
    return (
      <>
        <Link href="/" className="back-link">&larr; Back to dashboard</Link>
        <div className="empty-state">
          <h3>Invalid group ID</h3>
          <p>Use a valid positive group ID in the URL.</p>
        </div>
      </>
    );
  }

  if (!group) {
    return (
      <>
        <Link href="/" className="back-link">&larr; Back to dashboard</Link>
        <div className="empty-state">
          <h3>Group not found</h3>
          <p>Group #{groupId} does not exist on-chain.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Link href="/" className="back-link">&larr; Back to dashboard</Link>

      <div className="page-header">
        <div>
          <span className="eyebrow">Group #{group.id}</span>
          <h1>{group.name}</h1>
          <p className="page-subtitle">
            {group.memberCount} member(s) &middot; {group.nextPoolId - 1} pool(s)
          </p>
        </div>
        <div className="page-header-actions">
          {isOwner && (
            <button className="primary-button" onClick={() => setShowAddMember(true)} disabled={!isWalletReady}>
              Add member
            </button>
          )}
          {isMember && (
            <button className="primary-button" onClick={() => setShowCreatePool(true)} disabled={!isWalletReady}>
              Create pool
            </button>
          )}
        </div>
      </div>

      <section className="status-grid status-grid--group">
        <article className="metric-card">
          <span className="metric-label">Owner</span>
          <strong className="metric-value address">{shortenAddress(group.owner)}</strong>
          <span className="metric-detail">
            <button className="inline-link" onClick={() => void copyTextToClipboard(group.owner)}>
              Copy address
            </button>
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Members</span>
          <strong className="metric-value">{group.memberCount}</strong>
          <span className="metric-detail">Registered wallets</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Pools</span>
          <strong className="metric-value">{group.nextPoolId - 1}</strong>
          <span className="metric-detail">Active contribution pools</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Your status</span>
          <strong className="metric-value address">
            {!wallet.address ? "Not connected" : isMember ? "Member" : "Not a member"}
          </strong>
          <span className="metric-detail">
            {isOwner ? "You own this group" : isMember ? "You can contribute" : "Ask the owner to add you"}
          </span>
        </article>
      </section>

      <FeedbackBanner feedback={feedback} />

      <section className="section-block">
        <h2 className="section-title">Pools</h2>
        <SearchBar
          value={search}
          onChange={setSearch}
          label="Search pools"
          placeholder="Search pools by name..."
        />

        {filteredPools.length === 0 ? (
          <div className="empty-state">
            <h3>{search ? "No pools match your search" : "No pools yet"}</h3>
            <p>{search ? "Try a different search term." : "Create the first pool in this group."}</p>
          </div>
        ) : (
          <div className="list-grid">
            {filteredPools.map((pool) => (
              <Link
                key={pool.id}
                href={`/groups/${groupId}/pools/${pool.id}`}
                className="pool-card"
              >
                <span className="card-kicker">Pool #{pool.id}</span>
                <h3 className="card-title">{pool.name}</h3>
                <div className="card-meta">
                  <span className="card-meta-item">
                    {formatAmount(pool.balance, appConfig.assetDecimals)} {appConfig.assetCode}
                  </span>
                  <span className="card-meta-item">Organizer: {shortenAddress(pool.organizer)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <AddMemberModal
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        onAdded={() => void loadGroup({ showLoading: false })}
        groupId={groupId}
        onSuccessFeedback={setFeedback}
      />

      <CreatePoolModal
        open={showCreatePool}
        onClose={() => setShowCreatePool(false)}
        onCreated={() => void loadGroup({ showLoading: false })}
        groupId={groupId}
        onSuccessFeedback={setFeedback}
      />
    </>
  );
}
