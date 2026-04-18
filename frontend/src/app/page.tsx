"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/contexts/wallet-context";
import { SearchBar } from "@/components/search-bar";
import { CreateGroupModal } from "@/components/create-group-modal";
import { shortenAddress } from "@/lib/format";
import { listGroups, readGroupCount } from "@/lib/talambag-client";
import type { GroupSummary } from "@/lib/types";

export default function DashboardPage() {
  const { wallet } = useWallet();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetched, count] = await Promise.all([listGroups(), readGroupCount()]);
      setGroups(fetched);
      setTotalGroups(count - 1);
    } catch {
      // leave groups empty
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

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

      <section className="status-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 22 }}>
        <article className="metric-card spotlight">
          <span className="metric-label">Total groups</span>
          <strong className="metric-value">{totalGroups}</strong>
          <span className="metric-detail">On-chain groups created</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Connected wallet</span>
          <strong className="metric-value address">{shortenAddress(wallet.address)}</strong>
          <span className="metric-detail">
            {wallet.network ? `${wallet.network} via Freighter` : "Not connected"}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Network</span>
          <strong className="metric-value address">
            {wallet.isExpectedNetwork ? "Connected" : wallet.status === "connected" ? "Mismatch" : "--"}
          </strong>
          <span className="metric-detail">
            {wallet.isExpectedNetwork
              ? "Ready for transactions"
              : wallet.status === "connected"
                ? "Switch Freighter to the correct network"
                : "Connect wallet to begin"}
          </span>
        </article>
      </section>

      <section style={{ marginTop: 28 }}>
        <div className="page-header">
          <div>
            <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Groups</h2>
            <p className="page-subtitle">Browse and manage community groups</p>
          </div>
          <div className="page-header-actions">
            <button
              className="primary-button"
              onClick={() => setShowCreateModal(true)}
              disabled={wallet.status !== "connected" || !wallet.isExpectedNetwork}
            >
              Create group
            </button>
          </div>
        </div>

        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by group name or ID..."
        />

        {isLoading ? (
          <div className="loading-state">Loading groups...</div>
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
      />
    </>
  );
}
