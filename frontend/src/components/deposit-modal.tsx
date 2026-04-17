"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { FeedbackBanner } from "@/components/feedback-banner";
import { useWallet } from "@/contexts/wallet-context";
import { appConfig } from "@/lib/config";
import { parseAmountToInt } from "@/lib/format";
import { depositToPool } from "@/lib/talambag-client";
import type { TxFeedback } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onDeposited: () => void;
  groupId: number;
  poolId: number;
};

export function DepositModal({ open, onClose, onDeposited, groupId, poolId }: Props) {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });

  const canSubmit =
    !isSubmitting &&
    wallet.status === "connected" &&
    wallet.address &&
    wallet.isExpectedNetwork &&
    amount.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address) return;

    setIsSubmitting(true);
    setFeedback({
      state: "signing",
      title: "Awaiting contribution signature",
      detail: "Freighter will ask you to approve the deposit.",
    });

    try {
      const parsed = parseAmountToInt(amount, appConfig.assetDecimals);
      const result = await depositToPool(wallet.address, groupId, poolId, parsed);

      setFeedback({
        state: "success",
        title: "Contribution received",
        detail: `${appConfig.assetCode} has been deposited into the pool.`,
        hash: result.hash,
      });

      setAmount("");
      onDeposited();
      setTimeout(onClose, 1500);
    } catch (error) {
      setFeedback({
        state: "error",
        title: "Contribution failed",
        detail: error instanceof Error ? error.message : "The deposit transaction failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setFeedback({ state: "idle", title: "" });
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="card-head">
        <span className="card-kicker">Contribution</span>
        <h2>Deposit into pool #{poolId}</h2>
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
