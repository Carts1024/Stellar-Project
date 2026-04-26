"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "@/contexts/wallet-context";
import { Navbar } from "@/components/navbar";
import { WalletStatusNotice } from "@/components/wallet-status-notice";

export function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <Navbar />
      <main className="page-shell">
        <div className="ambient ambient-left" />
        <div className="ambient ambient-right" />
        <WalletStatusNotice />
        {children}
      </main>
    </WalletProvider>
  );
}
