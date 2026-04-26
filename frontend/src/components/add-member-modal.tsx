"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { FeedbackBanner } from "@/components/feedback-banner";
import { useWallet } from "@/contexts/wallet-context";
import { TxError, addGroupMember } from "@/lib/talambag-client";
import { isValidStellarAddress } from "@/lib/validators";
import type { TxFeedback } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  groupId: number;
  onSuccessFeedback: (feedback: TxFeedback) => void;
};

export function AddMemberModal({ open, onClose, onAdded, groupId, onSuccessFeedback }: Props) {
  const { wallet } = useWallet();
  const [memberAddress, setMemberAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });

  const isValid = memberAddress.trim() ? isValidStellarAddress(memberAddress) : false;
  const canSubmit =
    !isSubmitting &&
    wallet.status === "connected" &&
    wallet.address &&
    wallet.isExpectedNetwork &&
    isValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address) return;

    setIsSubmitting(true);
    setFeedback({
      state: "signing",
      title: "Awaiting member approval",
      detail: "Your selected wallet will confirm the membership update.",
    });

    try {
      const result = await addGroupMember(
        wallet.address,
        groupId,
        memberAddress.trim(),
        () =>
          setFeedback({
            state: "submitting",
            title: "Transaction broadcast",
            detail: "Waiting for on-chain confirmation...",
          }),
      );
      const successFeedback: TxFeedback = {
        state: "success",
        title: "Member added",
        detail: "The wallet can now create pools and contribute.",
        hash: result.hash,
      };
      setFeedback(successFeedback);
      onSuccessFeedback(successFeedback);
      setMemberAddress("");
      onAdded();
      handleClose();
    } catch (error) {
      const isRejected = error instanceof TxError && error.kind === "rejected";
      setFeedback({
        state: isRejected ? "rejected" : "error",
        title: isRejected ? "Member addition canceled" : "Adding the member failed",
        detail: error instanceof Error ? error.message : "The member could not be added.",
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
        <span className="card-kicker">Membership</span>
        <h2>Add a member to group #{groupId}</h2>
      </div>
      <p className="card-copy">
        Only the group owner can approve new members. Members can create pools and contribute.
      </p>
      <FeedbackBanner feedback={feedback} />
      <form className="stack-form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Member address
          <input
            type="text"
            value={memberAddress}
            onChange={(e) => setMemberAddress(e.target.value)}
            placeholder="G..."
          />
        </label>
        {memberAddress.trim() && !isValid ? (
          <p className="field-hint error-text">Enter a valid Stellar address.</p>
        ) : null}
        <button className="primary-button" type="submit" disabled={!canSubmit}>
          {isSubmitting ? "Submitting..." : "Add member"}
        </button>
      </form>
    </Modal>
  );
}
