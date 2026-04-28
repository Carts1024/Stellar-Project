import type { WalletSnapshot } from "@/lib/types";
import { readStoredValue, removeStoredValue, writeStoredValue } from "@/lib/pwa/browser-storage";

const WALLET_STORAGE_KEY = "talambag:wallet:v1";
const WALLET_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type PersistedWalletRecord = {
  persistedAt: number;
  snapshot: Omit<WalletSnapshot, "isCached">;
  version: 1;
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isPersistedWalletSnapshot(value: unknown): value is Omit<WalletSnapshot, "isCached"> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.status === "connected" &&
    isNullableString(record.address) &&
    typeof record.address === "string" &&
    isNullableString(record.walletId) &&
    isNullableString(record.walletName) &&
    isNullableString(record.network) &&
    isNullableString(record.networkPassphrase) &&
    isBoolean(record.isExpectedNetwork) &&
    isBoolean(record.isNetworkVerified) &&
    isNullableString(record.xlmBalance) &&
    (record.error === undefined || typeof record.error === "string")
  );
}

function isPersistedWalletRecord(value: unknown): value is PersistedWalletRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.persistedAt === "number" &&
    Number.isFinite(record.persistedAt) &&
    isPersistedWalletSnapshot(record.snapshot)
  );
}

export function readPersistedWalletSnapshot(): WalletSnapshot | null {
  const record = readStoredValue<unknown>(WALLET_STORAGE_KEY);
  if (!isPersistedWalletRecord(record)) {
    removeStoredValue(WALLET_STORAGE_KEY);
    return null;
  }

  if (Date.now() - record.persistedAt > WALLET_SNAPSHOT_MAX_AGE_MS) {
    removeStoredValue(WALLET_STORAGE_KEY);
    return null;
  }

  return {
    ...record.snapshot,
    error: undefined,
    isCached: true,
  };
}

export function persistWalletSnapshot(snapshot: WalletSnapshot) {
  if (snapshot.status !== "connected" || !snapshot.address) {
    removeStoredValue(WALLET_STORAGE_KEY);
    return;
  }

  const persistableSnapshot: Omit<WalletSnapshot, "isCached"> = {
    status: snapshot.status,
    address: snapshot.address,
    walletId: snapshot.walletId,
    walletName: snapshot.walletName,
    network: snapshot.network,
    networkPassphrase: snapshot.networkPassphrase,
    isExpectedNetwork: snapshot.isExpectedNetwork,
    isNetworkVerified: snapshot.isNetworkVerified,
    xlmBalance: snapshot.xlmBalance,
    error: snapshot.error,
  };

  writeStoredValue(WALLET_STORAGE_KEY, {
    persistedAt: Date.now(),
    snapshot: {
      ...persistableSnapshot,
      error: undefined,
    },
    version: 1,
  } satisfies PersistedWalletRecord);
}

export function clearPersistedWalletSnapshot() {
  removeStoredValue(WALLET_STORAGE_KEY);
}