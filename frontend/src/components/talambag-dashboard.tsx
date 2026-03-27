"use client";

import { startTransition, useEffect, useState } from "react";
import { appConfig } from "@/lib/config";
import { formatAmount, parseAmountToInt, shortenAddress } from "@/lib/format";
import { getContractSnapshot, depositToPool, initializePool, withdrawFromPool } from "@/lib/talambag-client";
import type { ContractSnapshot, TxFeedback } from "@/lib/types";
import { useFreighterWallet } from "@/hooks/use-freighter-wallet";

const initialContractState: ContractSnapshot = {
  status: "loading",
  organizer: null,
  assetAddress: null,
  poolBalance: null,
};

const idleFeedback: TxFeedback = {
  state: "idle",
  title: "Ready when you are",
  detail: "Connect Freighter to initialize the pool, contribute, or withdraw as the organizer.",
};

export function TalambagDashboard() {
  const { wallet, connectWallet, refreshWallet } = useFreighterWallet();
  const [contract, setContract] = useState<ContractSnapshot>(initialContractState);
  const [txFeedback, setTxFeedback] = useState<TxFeedback>(idleFeedback);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [assetAddress, setAssetAddress] = useState(appConfig.assetAddress);

  async function refreshContract() {
    setIsRefreshing(true);

    try {
      const snapshot = await getContractSnapshot();
      startTransition(() => {
        setContract(snapshot);
      });
      return snapshot;
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshContract();
  }, []);

  const isOrganizer =
    wallet.address !== null &&
    contract.organizer !== null &&
    wallet.address === contract.organizer;

  const actionsBlocked =
    isSubmitting ||
    wallet.status !== "connected" ||
    !wallet.address ||
    !wallet.isExpectedNetwork;

  function explorerLink(hash?: string) {
    if (!hash) {
      return null;
    }

    return `${appConfig.explorerUrl}/tx/${hash}`;
  }

  async function handleConnectWallet() {
    try {
      const nextWallet = await connectWallet();

      if (!nextWallet.isExpectedNetwork) {
        setTxFeedback({
          state: "error",
          title: "Switch Freighter to the app network",
          detail: `Talambag is configured for ${appConfig.network}.`,
        });
      } else {
        setTxFeedback({
          state: "success",
          title: "Wallet connected",
          detail: `${shortenAddress(nextWallet.address)} is ready on ${nextWallet.network ?? appConfig.network}.`,
        });
      }
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Connection failed",
        detail: error instanceof Error ? error.message : "Freighter did not approve the connection.",
      });
    }
  }

  async function handleInitialize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address) {
      setTxFeedback({
        state: "error",
        title: "Connect your wallet first",
        detail: "Initialization must be signed by the organizer wallet.",
      });
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting organizer signature",
      detail: "Freighter will ask you to approve the initialization transaction.",
    });

    try {
      const result = await initializePool(wallet.address, assetAddress.trim());
      await refreshContract();
      setTxFeedback({
        state: "success",
        title: "Pool initialized",
        detail: "The contract is ready for public contributions.",
        hash: result.hash,
      });
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Initialization failed",
        detail: error instanceof Error ? error.message : "The contract could not be initialized.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address) {
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting deposit signature",
      detail: "Review the amount in Freighter before confirming.",
    });

    try {
      const amount = parseAmountToInt(depositAmount, appConfig.assetDecimals);
      const result = await depositToPool(wallet.address, amount);
      await refreshContract();
      setDepositAmount("");
      setTxFeedback({
        state: "success",
        title: "Contribution received",
        detail: `Your ${appConfig.assetCode} deposit is on the way to the Talambag pool.`,
        hash: result.hash,
      });
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Deposit failed",
        detail: error instanceof Error ? error.message : "The contribution transaction failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleWithdraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address) {
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting organizer signature",
      detail: "Freighter will confirm the withdrawal recipient and amount.",
    });

    try {
      const amount = parseAmountToInt(withdrawAmount, appConfig.assetDecimals);
      const result = await withdrawFromPool(wallet.address, withdrawRecipient.trim(), amount);
      await refreshContract();
      setWithdrawAmount("");
      setWithdrawRecipient("");
      setTxFeedback({
        state: "success",
        title: "Withdrawal submitted",
        detail: "The organizer transfer has been sent to Stellar testnet.",
        hash: result.hash,
      });
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Withdrawal failed",
        detail: error instanceof Error ? error.message : "The withdrawal could not be submitted.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setTxFeedback({
      state: "success",
      title: "Copied to clipboard",
      detail: value,
    });
  }

  return (
    <main className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Transparent pooled giving on Soroban</span>
          <h1>Talambag keeps community contributions visible, calm, and accountable.</h1>
          <p>
            Contributors can verify the pool on-chain, organizers can withdraw only with
            their verified wallet, and the entire flow stays understandable for first-time
            Stellar users.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary-button" onClick={handleConnectWallet} disabled={wallet.status === "connecting"}>
            {wallet.status === "connected" ? "Reconnect Freighter" : "Connect Freighter"}
          </button>
          <button className="ghost-button" onClick={() => void refreshContract()} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing..." : "Refresh pool data"}
          </button>
        </div>
      </section>

      <section className="status-grid">
        <article className="metric-card spotlight">
          <span className="metric-label">Pool balance</span>
          <strong className="metric-value">
            {contract.status === "ready"
              ? `${formatAmount(contract.poolBalance, appConfig.assetDecimals)} ${appConfig.assetCode}`
              : "--"}
          </strong>
          <span className="metric-detail">
            Contract status: <strong>{contract.status}</strong>
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">Organizer wallet</span>
          <strong className="metric-value address">{shortenAddress(contract.organizer)}</strong>
          <span className="metric-detail">
            {contract.organizer ? (
              <button className="inline-link" onClick={() => void copyText(contract.organizer)}>
                Copy organizer address
              </button>
            ) : (
              "Available after initialization"
            )}
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">Connected wallet</span>
          <strong className="metric-value address">{shortenAddress(wallet.address)}</strong>
          <span className="metric-detail">
            {wallet.network ? `${wallet.network} via Freighter` : "Wallet not connected"}
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">Asset contract</span>
          <strong className="metric-value address">
            {shortenAddress(contract.assetAddress || assetAddress || null)}
          </strong>
          <span className="metric-detail">{appConfig.assetCode} on Stellar testnet</span>
        </article>
      </section>

      <section className={`feedback-card ${txFeedback.state}`}>
        <div>
          <h2>{txFeedback.title}</h2>
          <p>{txFeedback.detail}</p>
        </div>
        {txFeedback.hash ? (
          <a href={explorerLink(txFeedback.hash) ?? "#"} target="_blank" rel="noreferrer" className="inline-link">
            View transaction
          </a>
        ) : null}
      </section>

      {wallet.error ? (
        <section className="notice-card warning">
          <h2>Wallet status</h2>
          <p>{wallet.error}</p>
        </section>
      ) : null}

      {!wallet.isExpectedNetwork && wallet.status === "connected" ? (
        <section className="notice-card warning">
          <h2>Network mismatch</h2>
          <p>
            Freighter is not on {appConfig.network}. Switch networks before attempting any
            contract write.
          </p>
        </section>
      ) : null}

      {contract.error ? (
        <section className="notice-card danger">
          <h2>Contract read issue</h2>
          <p>{contract.error}</p>
        </section>
      ) : null}

      <section className="panel-grid">
        {contract.status === "uninitialized" ? (
          <article className="action-card init-card">
            <div className="card-head">
              <span className="card-kicker">One-time setup</span>
              <h2>Initialize the contribution pool</h2>
            </div>
            <p className="card-copy">
              The organizer wallet signs once to lock in the verified organizer address and
              the token contract used for deposits.
            </p>
            <form className="stack-form" onSubmit={(event) => void handleInitialize(event)}>
              <label>
                Organizer wallet
                <input type="text" value={wallet.address ?? ""} readOnly placeholder="Connect Freighter first" />
              </label>
              <label>
                Asset contract address
                <input
                  type="text"
                  value={assetAddress}
                  onChange={(event) => setAssetAddress(event.target.value)}
                  placeholder="CA..."
                />
              </label>
              <button className="primary-button" type="submit" disabled={actionsBlocked || !assetAddress.trim()}>
                {isSubmitting ? "Preparing..." : "Initialize pool"}
              </button>
            </form>
          </article>
        ) : null}

        <article className="action-card">
          <div className="card-head">
            <span className="card-kicker">Contributor flow</span>
            <h2>Deposit to the shared pool</h2>
          </div>
          <p className="card-copy">
            Anyone can contribute once connected. The contract moves funds from the signer’s
            wallet into the communal Talambag pool.
          </p>
          <form className="stack-form" onSubmit={(event) => void handleDeposit(event)}>
            <label>
              Amount
              <input
                type="text"
                inputMode="decimal"
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                placeholder={`0.00 ${appConfig.assetCode}`}
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={actionsBlocked || contract.status !== "ready" || !depositAmount.trim()}
            >
              {isSubmitting ? "Submitting..." : `Deposit ${appConfig.assetCode}`}
            </button>
          </form>
        </article>

        <article className="action-card organizer-card">
          <div className="card-head">
            <span className="card-kicker">Organizer flow</span>
            <h2>Withdraw to a recipient</h2>
          </div>
          <p className="card-copy">
            Only the verified organizer wallet can withdraw from the pool. This panel stays
            visible for transparency and unlocks only when the organizer connects.
          </p>
          <form className="stack-form" onSubmit={(event) => void handleWithdraw(event)}>
            <label>
              Recipient address
              <input
                type="text"
                value={withdrawRecipient}
                onChange={(event) => setWithdrawRecipient(event.target.value)}
                placeholder="G..."
              />
            </label>
            <label>
              Amount
              <input
                type="text"
                inputMode="decimal"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
                placeholder={`0.00 ${appConfig.assetCode}`}
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={
                actionsBlocked ||
                !isOrganizer ||
                contract.status !== "ready" ||
                !withdrawAmount.trim() ||
                !withdrawRecipient.trim()
              }
            >
              {isOrganizer
                ? isSubmitting
                  ? "Submitting..."
                  : "Withdraw from pool"
                : "Organizer wallet required"}
            </button>
          </form>
        </article>
      </section>

      <section className="footer-strip">
        <div>
          <span className="footer-label">Contract ID</span>
          <p>{appConfig.contractId || "Set NEXT_PUBLIC_TALAMBAG_CONTRACT_ID"}</p>
        </div>
        <div>
          <span className="footer-label">Public read account</span>
          <p>{appConfig.readAddress || "Set NEXT_PUBLIC_STELLAR_READ_ADDRESS"}</p>
        </div>
        <button className="ghost-button" onClick={() => void refreshWallet()}>
          Re-check wallet state
        </button>
      </section>
    </main>
  );
}
