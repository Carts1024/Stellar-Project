"use client";

import Link from "next/link";
import { WalletButton } from "@/components/wallet-kit-button";

export function Navbar() {
  return (
    <header className="navbar" role="banner">
      <Link href="/" className="navbar-brand">
        Talambag
      </Link>

      <div className="navbar-actions">
        <WalletButton />
      </div>
    </header>
  );
}
