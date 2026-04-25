"use client";

import { useWallet } from "@/contexts/wallet-context";
import { appConfig } from "@/lib/config";

type WalletNotice = {
  tone: "warning" | "danger";
  title: string;
  detail: string;
};

function getWalletNotice(
  wallet: ReturnType<typeof useWallet>["wallet"],
): WalletNotice | null {
  if (wallet.status === "connected" && !wallet.isExpectedNetwork) {
    const connectedNetwork = wallet.network ?? wallet.networkPassphrase ?? "Unknown network";

    return {
      tone: "warning",
      title: "Switch to the expected network",
      detail: `${wallet.walletName ?? "Your wallet"} is connected to ${connectedNetwork}. Switch to ${appConfig.network} before creating groups, pools, or transactions.`,
    };
  }

  if (wallet.status === "unsupported" && wallet.error) {
    return {
      tone: "danger",
      title: "Wallet integration unavailable",
      detail: wallet.error,
    };
  }

  if (wallet.error) {
    return {
      tone: "warning",
      title: "Wallet action needed",
      detail: wallet.error,
    };
  }

  return null;
}

export function WalletStatusNotice() {
  const { wallet } = useWallet();
  const notice = getWalletNotice(wallet);

  if (!notice) {
    return null;
  }

  return (
    <section className={`notice-card ${notice.tone} global-wallet-notice`}>
      <span className="card-kicker">Wallet status</span>
      <h2>{notice.title}</h2>
      <p>{notice.detail}</p>
    </section>
  );
}