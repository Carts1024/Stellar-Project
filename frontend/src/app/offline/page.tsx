import Link from "next/link";

export default function OfflinePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Offline mode</span>
          <h1>Talambag is temporarily offline.</h1>
          <p>
            Cached read-only screens can still remain available after a warm load, but wallet
            connections, live contract reads, and Soroban transactions require an active internet
            connection.
          </p>
        </div>
        <div className="hero-actions">
          <Link href="/" className="primary-button">
            Retry dashboard
          </Link>
        </div>
      </section>

      <section className="panel-grid section-block">
        <article className="action-card">
          <span className="card-kicker">Still available</span>
          <h2 className="card-title">Installed shell and recent cached views</h2>
          <p className="card-copy">
            Pages you already opened can stay readable while the connection is interrupted.
          </p>
        </article>
        <article className="action-card">
          <span className="card-kicker">Requires internet</span>
          <h2 className="card-title">Wallet actions and on-chain writes</h2>
          <p className="card-copy">
            Connecting a wallet, reading fresh contract state, deposits, withdrawals, and reward
            claims stay online-only for safety and correctness.
          </p>
        </article>
        <article className="action-card">
          <span className="card-kicker">Next step</span>
          <h2 className="card-title">Reconnect and refresh</h2>
          <p className="card-copy">
            Return online, then refresh the app to resume realtime updates and transaction flows.
          </p>
        </article>
      </section>
    </>
  );
}