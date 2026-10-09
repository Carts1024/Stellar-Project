"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/modal";
import { FeedbackBanner } from "@/components/feedback-banner";
import { useWallet } from "@/contexts/wallet-context";
import { appConfig } from "@/lib/config";
import { parseAmountToInt } from "@/lib/format";
import { invalidateRewardSnapshotCaches } from "@/lib/rewards-client";
import { getTransactionFailureFeedback, depositToPool } from "@/lib/talambag-client";
import type { TxFeedback } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onDeposited: () => void;
  groupId: number;
  poolId: number;
  onSuccessFeedback: (feedback: TxFeedback) => void;
};

export function DepositModal({
  open,
  onClose,
  onDeposited,
  groupId,
  poolId,
  onSuccessFeedback,
}: Props) {
  const { wallet } = useWallet();
  const titleId = useId();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });

  const canSubmit =
    !isSubmitting &&
    wallet.status === "connected" &&
    wallet.address &&
    !wallet.isCached &&
    wallet.isExpectedNetwork &&
    amount.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address) return;

    setIsSubmitting(true);
    setFeedback({
      state: "signing",
      title: "Awaiting contribution signature",
      detail: "Your selected wallet will ask you to approve the deposit.",
    });

    try {
      const parsed = parseAmountToInt(amount, appConfig.assetDecimals);
      const result = await depositToPool(
        wallet.address,
        groupId,
        poolId,
        parsed,
        () =>
          setFeedback({
            state: "submitting",
            title: appConfig.gasEnabled ? "Sending to Gas Station" : "Transaction broadcast",
            detail: appConfig.gasEnabled
              ? "The signed Testnet transaction is being handed to the relayer."
              : "Waiting for on-chain confirmation...",
          }),
      );

      const successFeedback: TxFeedback = {
        state: "success",
        title: "Contribution received",
        detail: `${appConfig.assetCode} has been deposited into the pool.`,
        hash: result.hash,
      };

      setFeedback(successFeedback);
      onSuccessFeedback(successFeedback);

      invalidateRewardSnapshotCaches(groupId, wallet.address);
      setAmount("");
      onDeposited();
      handleClose();
    } catch (error) {
      setFeedback(
        getTransactionFailureFeedback(error, {
          cancelledTitle: "Contribution canceled",
          failedTitle: "Contribution failed",
          deniedTitle: "Gas sponsorship unavailable",
          pendingTitle: "Contribution pending",
          fallbackMessage: "The deposit transaction failed.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setFeedback({ state: "idle", title: "" });
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} titleId={titleId}>
      <div className="card-head">
        <span className="card-kicker">Contribution</span>
        <h2 id={titleId}>Deposit into pool #{poolId}</h2>
      </div>
      <p className="card-copy">
        Deposits are allowed only for wallets that belong to the group.
      </p>
      <FeedbackBanner feedback={feedback} />
      <form className="stack-form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Amount
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`0.00 ${appConfig.assetCode}`}
          />
        </label>
        <button className="primary-button" type="submit" disabled={!canSubmit}>
          {isSubmitting ? "Submitting..." : `Deposit ${appConfig.assetCode}`}
        </button>
      </form>
    </Modal>
  );
}
