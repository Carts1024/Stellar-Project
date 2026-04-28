"use client";

import type { ReactNode } from "react";
import { ConnectivityBanner } from "@/components/connectivity-banner";
import { PwaBootstrap } from "@/components/pwa-bootstrap";
import { WalletProvider } from "@/contexts/wallet-context";
import { Navbar } from "@/components/navbar";
import { WalletStatusNotice } from "@/components/wallet-status-notice";

export function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <PwaBootstrap />
      <Navbar />
      <main className="page-shell">
        <div className="ambient ambient-left" />
        <div className="ambient ambient-right" />
        <div className="global-notice-stack">
          <ConnectivityBanner />
          <WalletStatusNotice />
        </div>
        {children}
      </main>
    </WalletProvider>
  );
}
