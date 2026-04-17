"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "@/contexts/wallet-context";
import { Navbar } from "@/components/navbar";

export function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <Navbar />
      <main className="page-shell">
        <div className="ambient ambient-left" />
        <div className="ambient ambient-right" />
        {children}
      </main>
    </WalletProvider>
  );
}
