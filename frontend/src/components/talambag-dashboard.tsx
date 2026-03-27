"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { appConfig } from "@/lib/config";
import { formatAmount, parseAmountToInt, shortenAddress } from "@/lib/format";
import {
  addGroupMember,
  createGroup,
  createPool,
  depositToPool,
  getContractSnapshot,
  withdrawFromPool,
} from "@/lib/talambag-client";
import type { ContractSnapshot, TxFeedback } from "@/lib/types";
import {
  isValidStellarAddress,
  parsePositiveInteger,
  requireText,
} from "@/lib/validators";
import { useFreighterWallet } from "@/hooks/use-freighter-wallet";

const initialContractState: ContractSnapshot = {
  status: "idle",
  selectedGroupId: null,
  selectedPoolId: null,
  group: null,
  pool: null,
  isWalletMember: null,
};

const idleFeedback: TxFeedback = {
  state: "idle",
  title: "Start with a group, then choose a pool",
  detail:
    "Create a group, add members, open a pool inside that group, and let members contribute on-chain.",
};

export function TalambagDashboard() {
  const { wallet, connectWallet, disconnectWallet, refreshWallet } = useFreighterWallet();
  const [contract, setContract] = useState<ContractSnapshot>(initialContractState);
  const [txFeedback, setTxFeedback] = useState<TxFeedback>(idleFeedback);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedGroupInput, setSelectedGroupInput] = useState("");
  const [selectedPoolInput, setSelectedPoolInput] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupAssetAddress, setGroupAssetAddress] = useState(appConfig.assetAddress);
  const [newMemberAddress, setNewMemberAddress] = useState("");
  const [poolName, setPoolName] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");

  const selectedGroup = contract.group;
  const selectedPool = contract.pool;
  const isGroupOwner =
    wallet.address !== null && selectedGroup !== null && wallet.address === selectedGroup.owner;
  const isPoolOrganizer =
    wallet.address !== null && selectedPool !== null && wallet.address === selectedPool.organizer;
  const actionsBlocked =
    isSubmitting ||
    wallet.status !== "connected" ||
    !wallet.address ||
    !wallet.isExpectedNetwork;
  const isGroupMember = contract.isWalletMember === true;
  const isValidGroupAssetAddress = groupAssetAddress.trim()
    ? isValidStellarAddress(groupAssetAddress)
    : false;
  const isValidNewMemberAddress = newMemberAddress.trim()
    ? isValidStellarAddress(newMemberAddress)
    : false;
  const isValidRecipientAddress = withdrawRecipient.trim()
    ? isValidStellarAddress(withdrawRecipient)
    : false;

  const loadSelection = useCallback(async (groupId: number | null, poolId: number | null) => {
    setIsRefreshing(true);

    try {
      const snapshot = await getContractSnapshot(groupId, poolId, wallet.address);
      startTransition(() => {
        setContract(snapshot);
      });
      return snapshot;
    } finally {
      setIsRefreshing(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    if (contract.selectedGroupId !== null) {
      void loadSelection(contract.selectedGroupId, contract.selectedPoolId);
    }
  }, [contract.selectedGroupId, contract.selectedPoolId, loadSelection, wallet.address]);

  function explorerLink(hash?: string) {
    if (!hash) {
      return null;
    }

    return `${appConfig.explorerUrl}/tx/${hash}`;
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setTxFeedback({
      state: "success",
      title: "Copied to clipboard",
      detail: value,
    });
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

  function handleDisconnectWallet() {
    disconnectWallet();
    setTxFeedback({
      state: "success",
      title: "Wallet disconnected",
      detail: "Talambag has cleared the current wallet session from the app UI.",
    });
  }

  async function handleLoadSelection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const groupId = parsePositiveInteger(selectedGroupInput, "Group ID");
      const poolId = selectedPoolInput.trim()
        ? parsePositiveInteger(selectedPoolInput, "Pool ID")
        : null;

      const snapshot = await loadSelection(groupId, poolId);

      if (snapshot.status === "ready") {
        setTxFeedback({
          state: "success",
          title: "Selection loaded",
          detail: poolId === null
            ? `Viewing group #${groupId}.`
            : `Viewing group #${groupId}, pool #${poolId}.`,
        });
      } else if (snapshot.error) {
        setTxFeedback({
          state: "error",
          title: "Unable to load the selected records",
          detail: snapshot.error,
        });
      }
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Selection is incomplete",
        detail: error instanceof Error ? error.message : "Enter a valid group and pool selection.",
      });
    }
  }

  async function handleCreateGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address) {
      setTxFeedback({
        state: "error",
        title: "Connect your wallet first",
        detail: "Group creation must be signed by the wallet that will own the group.",
      });
      return;
    }

    if (!isValidGroupAssetAddress) {
      setTxFeedback({
        state: "error",
        title: "Invalid asset contract address",
        detail: "Enter a valid Stellar token contract address for this group.",
      });
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting group creation signature",
      detail: "Freighter will ask you to approve the new group transaction.",
    });

    try {
      const result = await createGroup(
        wallet.address,
        requireText(groupName, "Group name"),
        groupAssetAddress.trim(),
      );

      if (result.groupId !== null) {
        setSelectedGroupInput(result.groupId.toString());
        setSelectedPoolInput("");
        await loadSelection(result.groupId, null);
      }

      setGroupName("");
      setTxFeedback({
        state: "success",
        title: "Group created",
        detail: result.groupId !== null
          ? `Group #${result.groupId} is ready for members and pools.`
          : "The group was created successfully.",
        hash: result.hash,
      });
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Group creation failed",
        detail: error instanceof Error ? error.message : "The group could not be created.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address || !selectedGroup) {
      return;
    }

    if (!isValidNewMemberAddress) {
      setTxFeedback({
        state: "error",
        title: "Invalid member address",
        detail: "Enter a valid Stellar address before adding a group member.",
      });
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting member approval",
      detail: "Freighter will confirm the membership update for this group.",
    });

    try {
      const result = await addGroupMember(wallet.address, selectedGroup.id, newMemberAddress.trim());
      await loadSelection(selectedGroup.id, contract.selectedPoolId);
      setNewMemberAddress("");
      setTxFeedback({
        state: "success",
        title: "Member added",
        detail: "The selected wallet can now create pools and contribute within this group.",
        hash: result.hash,
      });
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Adding the member failed",
        detail: error instanceof Error ? error.message : "The member could not be added to the group.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreatePool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address || !selectedGroup) {
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting pool creation signature",
      detail: "The wallet creating this pool will become its organizer.",
    });

    try {
      const result = await createPool(
        wallet.address,
        selectedGroup.id,
        requireText(poolName, "Pool name"),
      );

      const nextPoolId = result.poolId ?? null;
      if (nextPoolId !== null) {
        setSelectedPoolInput(nextPoolId.toString());
        await loadSelection(selectedGroup.id, nextPoolId);
      } else {
        await loadSelection(selectedGroup.id, contract.selectedPoolId);
      }

      setPoolName("");
      setTxFeedback({
        state: "success",
        title: "Pool created",
        detail: nextPoolId !== null
          ? `Pool #${nextPoolId} is ready for member contributions.`
          : "The pool was created successfully.",
        hash: result.hash,
      });
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Pool creation failed",
        detail: error instanceof Error ? error.message : "The pool could not be created.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address || !selectedGroup || !selectedPool) {
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting contribution signature",
      detail: "Freighter will ask you to approve the deposit for the selected pool.",
    });

    try {
      const amount = parseAmountToInt(depositAmount, appConfig.assetDecimals);
      const result = await depositToPool(wallet.address, selectedGroup.id, selectedPool.id, amount);
      await loadSelection(selectedGroup.id, selectedPool.id);
      setDepositAmount("");
      setTxFeedback({
        state: "success",
        title: "Contribution received",
        detail: `${appConfig.assetCode} has been routed into the selected group pool.`,
        hash: result.hash,
      });
    } catch (error) {
      setTxFeedback({
        state: "error",
        title: "Contribution failed",
        detail: error instanceof Error ? error.message : "The deposit transaction failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleWithdraw(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!wallet.address || !selectedGroup || !selectedPool) {
      return;
    }

    if (!isValidRecipientAddress) {
      setTxFeedback({
        state: "error",
        title: "Invalid recipient address",
        detail: "Withdrawal requires a valid Stellar recipient address.",
      });
      return;
    }

    setIsSubmitting(true);
    setTxFeedback({
      state: "signing",
      title: "Awaiting organizer signature",
      detail: "Freighter will confirm the selected pool withdrawal.",
    });

    try {
      const amount = parseAmountToInt(withdrawAmount, appConfig.assetDecimals);
      const result = await withdrawFromPool(
        wallet.address,
        selectedGroup.id,
        selectedPool.id,
        withdrawRecipient.trim(),
        amount,
      );
      await loadSelection(selectedGroup.id, selectedPool.id);
      setWithdrawAmount("");
      setWithdrawRecipient("");
      setTxFeedback({
        state: "success",
        title: "Withdrawal submitted",
        detail: "The organizer transfer has been sent from the selected pool.",
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

  return (
    <main className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Group-based pooled giving on Soroban</span>
          <h1>Talambag now organizes community fundraising by group and by pool.</h1>
          <p>
            Group owners manage membership, members open new pools, and the wallet that creates
            each pool becomes its organizer. Contributions stay restricted to group members while
            balances remain transparent on-chain.
          </p>
        </div>

        <div className="hero-actions">
          <button
            className="primary-button"
            onClick={handleConnectWallet}
            disabled={wallet.status === "connecting" || wallet.status === "connected"}
          >
            {wallet.status === "connecting" ? "Connecting..." : "Connect Freighter"}
          </button>
          <button
            className="ghost-button"
            onClick={handleDisconnectWallet}
            disabled={wallet.status !== "connected"}
          >
            Disconnect wallet
          </button>
          <button
            className="ghost-button"
            onClick={() => void loadSelection(contract.selectedGroupId, contract.selectedPoolId)}
            disabled={isRefreshing || contract.selectedGroupId === null}
          >
            {isRefreshing ? "Refreshing..." : "Refresh selected records"}
          </button>
        </div>
      </section>

      <section className="status-grid">
        <article className="metric-card spotlight">
          <span className="metric-label">Selected pool balance</span>
          <strong className="metric-value">
            {selectedPool
              ? `${formatAmount(selectedPool.balance, appConfig.assetDecimals)} ${appConfig.assetCode}`
              : "--"}
          </strong>
          <span className="metric-detail">
            {selectedPool
              ? `Pool #${selectedPool.id} in group #${selectedPool.groupId}`
              : "Select a group and pool to inspect balances"}
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">Selected group</span>
          <strong className="metric-value address">
            {selectedGroup ? `${selectedGroup.name} (#${selectedGroup.id})` : "No group selected"}
          </strong>
          <span className="metric-detail">
            {selectedGroup
              ? `${selectedGroup.memberCount} member(s), next pool #${selectedGroup.nextPoolId}`
              : "Load a group to view its metadata"}
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">Pool organizer</span>
          <strong className="metric-value address">{shortenAddress(selectedPool?.organizer ?? null)}</strong>
          <span className="metric-detail">
            {selectedPool?.organizer ? (
              <button className="inline-link" onClick={() => void copyText(selectedPool.organizer)}>
                Copy organizer address
              </button>
            ) : (
              "Available after a pool is selected"
            )}
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">Wallet access</span>
          <strong className="metric-value address">{shortenAddress(wallet.address)}</strong>
          <span className="metric-detail">
            {selectedGroup
              ? isGroupMember
                ? "This wallet is a member of the selected group"
                : "This wallet is not a member of the selected group"
              : wallet.network
                ? `${wallet.network} via Freighter`
                : "Wallet not connected"}
          </span>
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
        <article className="action-card">
          <div className="card-head">
            <span className="card-kicker">Selection</span>
            <h2>Load a group and an optional pool</h2>
          </div>
          <p className="card-copy">
            Use on-chain IDs to inspect a group first, then optionally target one pool inside it.
          </p>
          <form className="stack-form" onSubmit={(event) => void handleLoadSelection(event)}>
            <label>
              Group ID
              <input
                type="text"
                inputMode="numeric"
                value={selectedGroupInput}
                onChange={(event) => setSelectedGroupInput(event.target.value)}
                placeholder="1"
              />
            </label>
            <label>
              Pool ID
              <input
                type="text"
                inputMode="numeric"
                value={selectedPoolInput}
                onChange={(event) => setSelectedPoolInput(event.target.value)}
                placeholder="Optional"
              />
            </label>
            <button className="primary-button" type="submit" disabled={isRefreshing || !selectedGroupInput.trim()}>
              {isRefreshing ? "Loading..." : "Load selection"}
            </button>
          </form>
        </article>

        <article className="action-card">
          <div className="card-head">
            <span className="card-kicker">Group creation</span>
            <h2>Create a new group</h2>
          </div>
          <p className="card-copy">
            The signer becomes the group owner and first member. That owner can add more members later.
          </p>
          <form className="stack-form" onSubmit={(event) => void handleCreateGroup(event)}>
            <label>
              Group name
              <input
                type="text"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Family Support Circle"
              />
            </label>
            <label>
              Asset contract address
              <input
                type="text"
                value={groupAssetAddress}
                onChange={(event) => setGroupAssetAddress(event.target.value)}
                placeholder="CA..."
              />
            </label>
            <button className="primary-button" type="submit" disabled={actionsBlocked || !groupName.trim()}>
              {isSubmitting ? "Submitting..." : "Create group"}
            </button>
            {groupAssetAddress.trim() && !isValidGroupAssetAddress ? (
              <p className="field-hint error-text">Enter a valid Stellar contract address.</p>
            ) : null}
          </form>
        </article>

        <article className="action-card">
          <div className="card-head">
            <span className="card-kicker">Membership</span>
            <h2>Add a member to the selected group</h2>
          </div>
          <p className="card-copy">
            Only the group owner can approve new members. Members can create pools and contribute.
          </p>
          <form className="stack-form" onSubmit={(event) => void handleAddMember(event)}>
            <label>
              Member address
              <input
                type="text"
                value={newMemberAddress}
                onChange={(event) => setNewMemberAddress(event.target.value)}
                placeholder="G..."
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={actionsBlocked || !selectedGroup || !isGroupOwner || !newMemberAddress.trim()}
            >
              {isGroupOwner ? (isSubmitting ? "Submitting..." : "Add member") : "Owner wallet required"}
            </button>
            {newMemberAddress.trim() && !isValidNewMemberAddress ? (
              <p className="field-hint error-text">Member must be a valid Stellar address.</p>
            ) : null}
          </form>
        </article>

        <article className="action-card">
          <div className="card-head">
            <span className="card-kicker">Pool creation</span>
            <h2>Create a pool inside the selected group</h2>
          </div>
          <p className="card-copy">
            Any member of the selected group can create a pool. The creating wallet becomes the organizer.
          </p>
          <form className="stack-form" onSubmit={(event) => void handleCreatePool(event)}>
            <label>
              Pool name
              <input
                type="text"
                value={poolName}
                onChange={(event) => setPoolName(event.target.value)}
                placeholder="Medical Emergency Fund"
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={actionsBlocked || !selectedGroup || !isGroupMember || !poolName.trim()}
            >
              {isGroupMember ? (isSubmitting ? "Submitting..." : "Create pool") : "Group member required"}
            </button>
          </form>
        </article>

        <article className="action-card">
          <div className="card-head">
            <span className="card-kicker">Contribution</span>
            <h2>Deposit into the selected pool</h2>
          </div>
          <p className="card-copy">
            Deposits are allowed only for wallets that belong to the selected group.
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
              disabled={actionsBlocked || !selectedGroup || !selectedPool || !isGroupMember || !depositAmount.trim()}
            >
              {isSubmitting ? "Submitting..." : `Deposit ${appConfig.assetCode}`}
            </button>
          </form>
        </article>

        <article className="action-card organizer-card">
          <div className="card-head">
            <span className="card-kicker">Organizer withdrawal</span>
            <h2>Withdraw from the selected pool</h2>
          </div>
          <p className="card-copy">
            Only the organizer of the selected pool can transfer funds out to a recipient.
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
                !selectedGroup ||
                !selectedPool ||
                !isPoolOrganizer ||
                !withdrawAmount.trim() ||
                !withdrawRecipient.trim() ||
                !isValidRecipientAddress
              }
            >
              {isPoolOrganizer
                ? isSubmitting
                  ? "Submitting..."
                  : "Withdraw from pool"
                : "Organizer wallet required"}
            </button>
            {withdrawRecipient.trim() && !isValidRecipientAddress ? (
              <p className="field-hint error-text">Recipient must be a valid Stellar address.</p>
            ) : null}
          </form>
        </article>
      </section>

      <section className="footer-strip">
        <div>
          <span className="footer-label">Selected group owner</span>
          <p>{selectedGroup ? selectedGroup.owner : "Load a group to see its owner wallet"}</p>
        </div>
        <div>
          <span className="footer-label">Selected group asset</span>
          <p>{selectedGroup ? selectedGroup.assetAddress : appConfig.assetAddress || "Set a default asset in .env.local"}</p>
        </div>
        <button className="ghost-button" onClick={() => void refreshWallet()}>
          Re-check wallet state
        </button>
      </section>
    </main>
  );
}
