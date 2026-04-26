"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { FeedbackBanner } from "@/components/feedback-banner";
import { useWallet } from "@/contexts/wallet-context";
import { TxError, createPool } from "@/lib/talambag-client";
import { requireText } from "@/lib/validators";
import type { TxFeedback } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (poolId: number | null) => void;
  groupId: number;
  onSuccessFeedback: (feedback: TxFeedback) => void;
};

export function CreatePoolModal({ open, onClose, onCreated, groupId, onSuccessFeedback }: Props) {
  const { wallet } = useWallet();
  const [poolName, setPoolName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });

  const canSubmit =
    !isSubmitting &&
    wallet.status === "connected" &&
    wallet.address &&
    wallet.isExpectedNetwork &&
    poolName.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address) return;

    setIsSubmitting(true);
    setFeedback({
      state: "signing",
      title: "Awaiting pool creation signature",
      detail: "The wallet creating this pool will become its organizer.",
    });

    try {
      const result = await createPool(
        wallet.address,
        groupId,
        requireText(poolName, "Pool name"),
        () =>
          setFeedback({
            state: "submitting",
            title: "Transaction broadcast",
            detail: "Waiting for on-chain confirmation...",
          }),
      );

      const successFeedback: TxFeedback = {
        state: "success",
        title: "Pool created",
        detail: result.poolId !== null
          ? `Pool #${result.poolId} is ready for contributions.`
          : "The pool was created successfully.",
        hash: result.hash,
      };

      setFeedback(successFeedback);
      onSuccessFeedback(successFeedback);

      setPoolName("");
      onCreated(result.poolId ?? null);
      handleClose();
    } catch (error) {
      const isRejected = error instanceof TxError && error.kind === "rejected";
      setFeedback({
        state: isRejected ? "rejected" : "error",
        title: isRejected ? "Pool creation canceled" : "Pool creation failed",
        detail: error instanceof Error ? error.message : "The pool could not be created.",
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
        <span className="card-kicker">Pool creation</span>
        <h2>Create a pool in group #{groupId}</h2>
      </div>
      <p className="card-copy">
        Any member of this group can create a pool. The creating wallet becomes the organizer.
      </p>
      <FeedbackBanner feedback={feedback} />
      <form className="stack-form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Pool name
          <input
            type="text"
            value={poolName}
            onChange={(e) => setPoolName(e.target.value)}
            placeholder="Medical Emergency Fund"
          />
        </label>
        <button className="primary-button" type="submit" disabled={!canSubmit}>
          {isSubmitting ? "Submitting..." : "Create pool"}
        </button>
      </form>
    </Modal>
  );
}
