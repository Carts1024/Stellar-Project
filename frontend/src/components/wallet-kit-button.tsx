"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { formatXlmBalance, shortenAddress } from "@/lib/format";
import type { WalletSnapshot } from "@/lib/types";

// ── Private sub-components ────────────────────────────────────────────────

function WalletAvatar({ name }: { readonly name: string | null }) {
  return (
    <span className="wb-avatar" aria-hidden="true">
      {(name ?? "W").charAt(0).toUpperCase()}
    </span>
  );
}

function NetworkBadge({ wallet }: { readonly wallet: WalletSnapshot }) {
  if (!wallet.network) return null;
  const isWrong = !wallet.isExpectedNetwork;
  return (
    <span
      className={`wb-network-badge${isWrong ? " wb-network-badge--warn" : ""}`}
      aria-label={isWrong ? `Wrong network: ${wallet.network}` : `Network: ${wallet.network}`}
    >
      {isWrong ? `⚠ ${wallet.network}` : wallet.network}
    </span>
  );
}

function AccountDropdown({
  wallet,
  isBusy,
  onDisconnect,
}: {
  readonly wallet: WalletSnapshot;
  readonly isBusy: boolean;
  readonly onDisconnect: () => void;
}) {
  function handleCopyAddress() {
    if (wallet.address) {
      void navigator.clipboard.writeText(wallet.address);
    }
  }

  return (
    <div className="wb-dropdown" role="menu" aria-label="Wallet options">
      <div className="wb-dropdown-header">
        <WalletAvatar name={wallet.walletName} />
        <div className="wb-dropdown-identity">
          <span className="wb-dropdown-wallet-name">{wallet.walletName ?? "Wallet"}</span>
          <NetworkBadge wallet={wallet} />
        </div>
      </div>

      <div className="wb-dropdown-divider" aria-hidden="true" />

      <div className="wb-dropdown-row">
        <span className="wb-dropdown-label">Address</span>
        <button
          type="button"
          className="wb-copy-btn"
          onClick={handleCopyAddress}
          aria-label={`Copy address ${wallet.address ?? ""}`}
          title="Click to copy full address"
        >
          {wallet.address}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" />
            <path d="M1.5 8.5V2A.5.5 0 012 1.5h6.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {wallet.xlmBalance !== null && (
        <div className="wb-dropdown-row">
          <span className="wb-dropdown-label">Balance</span>
          <span className="wb-dropdown-value">{formatXlmBalance(wallet.xlmBalance)} XLM</span>
        </div>
      )}

      <div className="wb-dropdown-divider" aria-hidden="true" />

      <button
        type="button"
        className="wb-disconnect-btn"
        onClick={onDisconnect}
        disabled={isBusy}
        role="menuitem"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9.5 5L12 7.5 9.5 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 7.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M5 2.5H2.5A.5.5 0 002 3v8a.5.5 0 00.5.5H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        Disconnect
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function WalletButton() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleConnect() {
    setIsBusy(true);
    try {
      await connectWallet();
    } catch {
      // connectWallet already wrote the error into wallet state.
      // Swallow here to prevent an unhandled rejection.
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisconnect() {
    setIsOpen(false);
    setIsBusy(true);
    try {
      await disconnectWallet();
    } finally {
      setIsBusy(false);
    }
  }

  if (wallet.status === "connected" && wallet.address) {
    return (
      <div className="wb-root" ref={containerRef}>
        <button
          type="button"
          className={`wb-account-btn${isOpen ? " wb-account-btn--open" : ""}`}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          disabled={isBusy}
        >
          <WalletAvatar name={wallet.walletName} />
          {wallet.xlmBalance !== null && (
            <span className="wb-balance">{formatXlmBalance(wallet.xlmBalance)} XLM</span>
          )}
          <span className="wb-address">{shortenAddress(wallet.address)}</span>
          <svg
            className={`wb-chevron${isOpen ? " wb-chevron--up" : ""}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {isOpen && (
          <AccountDropdown wallet={wallet} isBusy={isBusy} onDisconnect={handleDisconnect} />
        )}
      </div>
    );
  }

  const isConnecting = wallet.status === "connecting" || isBusy;

  return (
    <button
      type="button"
      className="wb-connect-btn"
      onClick={handleConnect}
      disabled={isConnecting}
      aria-label={isConnecting ? "Connecting wallet…" : "Connect Wallet"}
    >
      {isConnecting ? (
        <>
          <span className="wb-spinner" aria-hidden="true" />
          Connecting…
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="4" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1 7.5h14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="11" cy="10" r="1.25" fill="currentColor" />
          </svg>
          Connect Wallet
        </>
      )}
    </button>
  );
}