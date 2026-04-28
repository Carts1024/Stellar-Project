"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function ConnectivityBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <section className="notice-card warning global-connectivity-notice" aria-live="polite">
      <span className="card-kicker">Connectivity</span>
      <h2>You are offline</h2>
      <p>
        Talambag can keep showing cached read-only data after a warm load, but wallet prompts,
        realtime updates, and Soroban transactions stay disabled until the connection returns.
      </p>
    </section>
  );
}