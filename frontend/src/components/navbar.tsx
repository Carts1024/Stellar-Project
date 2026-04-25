"use client";

import Link from "next/link";
import { useWallet } from "@/contexts/wallet-context";
import { WalletKitButton } from "@/components/wallet-kit-button";
import { appConfig } from "@/lib/config";
import { formatXlmBalance, shortenAddress } from "@/lib/format";

export function Navbar() {
  const { wallet } = useWallet();

  return (
    <nav className="navbar">
      <Link href="/" className="navbar-brand">
        Talambag
      </Link>

      <div className="navbar-actions">
        {wallet.status === "connected" && wallet.address ? (
          <div className="navbar-wallet-group">
            <span className="navbar-wallet">
              {wallet.xlmBalance !== null && (
                <span className="navbar-balance">
                  {formatXlmBalance(wallet.xlmBalance)} XLM
                </span>
              )}
              {shortenAddress(wallet.address)}
              {wallet.walletName ? <span className="navbar-badge">{wallet.walletName}</span> : null}
              {!wallet.isExpectedNetwork ? (
                <span className="navbar-badge warning">Wrong network</span>
              ) : (
                <span className="navbar-badge">{appConfig.network}</span>
              )}
            </span>
            <WalletKitButton />
          </div>
        ) : wallet.status === "unsupported" && wallet.error ? (
          <>
            <span className="navbar-wallet-error" title={wallet.error}>
              Wallet unavailable
            </span>
            <WalletKitButton />
          </>
        ) : <WalletKitButton />}
      </div>
    </nav>
  );
}
