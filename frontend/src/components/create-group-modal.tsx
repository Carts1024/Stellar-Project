"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { FeedbackBanner } from "@/components/feedback-banner";
import { useWallet } from "@/contexts/wallet-context";
import { appConfig } from "@/lib/config";
import { createGroup } from "@/lib/talambag-client";
import { isValidStellarAddress, requireText } from "@/lib/validators";
import type { TxFeedback } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onSuccessFeedback: (feedback: TxFeedback) => void;
};

export function CreateGroupModal({ open, onClose, onCreated, onSuccessFeedback }: Props) {
  const { wallet } = useWallet();
  const [groupName, setGroupName] = useState("");
  const [assetAddress, setAssetAddress] = useState(appConfig.assetAddress);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback>({ state: "idle", title: "" });

  const isValidAsset = assetAddress.trim() ? isValidStellarAddress(assetAddress) : false;
  const canSubmit =
    !isSubmitting &&
    wallet.status === "connected" &&
    wallet.address &&
    wallet.isExpectedNetwork &&
    groupName.trim() &&
    isValidAsset;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.address) return;

    setIsSubmitting(true);
    setFeedback({
      state: "signing",
      title: "Awaiting group creation signature",
      detail: "Your selected wallet will ask you to approve the new group transaction.",
    });

    try {
      const result = await createGroup(
        wallet.address,
        requireText(groupName, "Group name"),
        assetAddress.trim(),
        () =>
          setFeedback({
            state: "submitting",
            title: "Transaction broadcast",
            detail: "Waiting for on-chain confirmation...",
          }),
      );

      const successFeedback: TxFeedback = {
        state: "success",
        title: "Group created",
        detail: result.groupId !== null
          ? `Group #${result.groupId} is ready for members and pools.`
          : "The group was created successfully.",
        hash: result.hash,
      };

      setFeedback(successFeedback);
      onSuccessFeedback(successFeedback);

      setGroupName("");
      onCreated();
      handleClose();
    } catch (error) {
      setFeedback({
        state: "error",
        title: "Group creation failed",
        detail: error instanceof Error ? error.message : "The group could not be created.",
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
        <span className="card-kicker">Group creation</span>
        <h2>Create a new group</h2>
      </div>
      <p className="card-copy">
        The signer becomes the group owner and first member. That owner can add more members later.
      </p>
      <FeedbackBanner feedback={feedback} />
      <form className="stack-form" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Group name
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Family Support Circle"
          />
        </label>
        <label>
          Asset contract address
          <input
            type="text"
            value={assetAddress}
            onChange={(e) => setAssetAddress(e.target.value)}
            placeholder="CA..."
          />
        </label>
        {assetAddress.trim() && !isValidAsset ? (
          <p className="field-hint error-text">Enter a valid Stellar contract address.</p>
        ) : null}
        <button className="primary-button" type="submit" disabled={!canSubmit}>
          {isSubmitting ? "Submitting..." : "Create group"}
        </button>
      </form>
    </Modal>
  );
}
