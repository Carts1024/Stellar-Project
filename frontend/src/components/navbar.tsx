"use client";

import Link from "next/link";
import { useWallet } from "@/contexts/wallet-context";
import { appConfig } from "@/lib/config";
import { shortenAddress } from "@/lib/format";

export function Navbar() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();

  async function handleConnect() {
    try {
      await connectWallet();
    } catch {
      // silently handled — wallet state will reflect the error
    }
  }

  return (
    <nav className="navbar">
      <Link href="/" className="navbar-brand">
        Talambag
      </Link>

      <div className="navbar-actions">
        {wallet.status === "connected" && wallet.address ? (
          <>
            <span className="navbar-wallet">
              {shortenAddress(wallet.address)}
              {!wallet.isExpectedNetwork ? (
                <span className="navbar-badge warning">Wrong network</span>
              ) : (
                <span className="navbar-badge">{appConfig.network}</span>
              )}
            </span>
            <button className="ghost-button navbar-btn" onClick={disconnectWallet}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            className="primary-button navbar-btn"
            onClick={() => void handleConnect()}
            disabled={wallet.status === "connecting"}
          >
            {wallet.status === "connecting" ? "Connecting..." : "Connect Freighter"}
          </button>
        )}
      </div>
    </nav>
  );
}
