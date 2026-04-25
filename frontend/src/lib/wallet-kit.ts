"use client";

import { ButtonMode, ButtonSize, type SwkButtonProps } from "@creit-tech/stellar-wallets-kit/components";
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils";
import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import {
  KitEventType,
  Networks as KitNetworks,
  SwkAppLightTheme,
  type KitEventDisconnected,
  type KitEventStateUpdated,
  type KitEventWalletSelected,
  type SwkAppTheme,
} from "@creit-tech/stellar-wallets-kit/types";
import { Horizon } from "@stellar/stellar-sdk";
import { appConfig, getExpectedNetworkPassphrase } from "@/lib/config";
import type { WalletSnapshot } from "@/lib/types";
import { isValidStellarAddress } from "@/lib/validators";

const networkLabelByPassphrase = new Map<string, string>([
  [KitNetworks.PUBLIC, "PUBLIC"],
  [KitNetworks.TESTNET, "TESTNET"],
  [KitNetworks.FUTURENET, "FUTURENET"],
  [KitNetworks.SANDBOX, "SANDBOX"],
  [KitNetworks.STANDALONE, "STANDALONE"],
]);

const kitTheme: SwkAppTheme = {
  ...SwkAppLightTheme,
  background: "#fff8ed",
  "background-secondary": "rgba(255, 250, 241, 0.96)",
  "foreground-strong": "#17251f",
  foreground: "#24352d",
  "foreground-secondary": "#59675f",
  primary: "#0f766e",
  "primary-foreground": "#f5f6f2",
  transparent: "rgba(255, 255, 255, 0)",
  lighter: "#fffdf8",
  light: "#f7f2e8",
  "light-gray": "#e3d8c9",
  gray: "#8a958d",
  danger: "#c75b4f",
  border: "rgba(23, 37, 31, 0.12)",
  shadow: "0 24px 60px rgba(24, 30, 26, 0.12)",
  "border-radius": "999px",
  "font-family": '"Segoe UI", "Helvetica Neue", sans-serif',
};

let walletKitInitialized = false;

type WalletKitEventSubscriptions = {
  onDisconnect?: (event: KitEventDisconnected) => void;
  onStateUpdated?: (event: KitEventStateUpdated) => void;
  onWalletSelected?: (event: KitEventWalletSelected) => void;
};

function createWalletSnapshot(overrides: Partial<WalletSnapshot> = {}): WalletSnapshot {
  return {
    status: "disconnected",
    address: null,
    walletId: null,
    walletName: null,
    network: null,
    networkPassphrase: null,
    isExpectedNetwork: false,
    xlmBalance: null,
    ...overrides,
  };
}

function getKitNetwork() {
  const expectedPassphrase = getExpectedNetworkPassphrase();
  const configuredName = appConfig.network.trim().toUpperCase();

  if (expectedPassphrase === KitNetworks.PUBLIC || configuredName === "PUBLIC" || configuredName === "PUBNET") {
    return KitNetworks.PUBLIC;
  }

  if (expectedPassphrase === KitNetworks.FUTURENET || configuredName === "FUTURENET") {
    return KitNetworks.FUTURENET;
  }

  if (expectedPassphrase === KitNetworks.SANDBOX || configuredName === "SANDBOX") {
    return KitNetworks.SANDBOX;
  }

  if (expectedPassphrase === KitNetworks.STANDALONE || configuredName === "STANDALONE") {
    return KitNetworks.STANDALONE;
  }

  return KitNetworks.TESTNET;
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}

function normalizeAddress(address: string) {
  const trimmedAddress = address.trim();

  if (!isValidStellarAddress(trimmedAddress)) {
    throw new Error("The selected wallet returned an invalid Stellar address.");
  }

  return trimmedAddress;
}

function readSelectedWalletMeta() {
  try {
    const selectedModule = StellarWalletsKit.selectedModule;
    return {
      walletId: selectedModule.productId,
      walletName: selectedModule.productName,
    };
  } catch {
    return {
      walletId: null,
      walletName: null,
    };
  }
}

function normalizeNetworkName(network: string | null, networkPassphrase: string | null) {
  if (network && network.trim()) {
    return network.trim();
  }

  if (networkPassphrase) {
    return networkLabelByPassphrase.get(networkPassphrase) ?? appConfig.network;
  }

  return null;
}

export function ensureWalletKitInitialized() {
  if (walletKitInitialized || typeof window === "undefined") {
    return;
  }

  StellarWalletsKit.init({
    modules: defaultModules(),
    network: getKitNetwork(),
    theme: kitTheme,
    authModal: {
      showInstallLabel: true,
      hideUnsupportedWallets: false,
    },
  });

  walletKitInitialized = true;
}

export async function fetchXlmBalance(address: string): Promise<string> {
  const server = new Horizon.Server(appConfig.horizonUrl);
  const account = await server.loadAccount(address);
  const native = account.balances.find((balance) => balance.asset_type === "native");
  return native?.balance ?? "0";
}

export async function readWalletSnapshot(): Promise<WalletSnapshot> {
  ensureWalletKitInitialized();

  const walletMeta = readSelectedWalletMeta();

  let address: string;
  try {
    const response = await StellarWalletsKit.getAddress();
    address = normalizeAddress(response.address);
  } catch {
    return createWalletSnapshot(walletMeta);
  }

  let networkName: string | null = null;
  let networkPassphrase: string | null = null;
  let networkError: string | undefined;

  try {
    const network = await StellarWalletsKit.getNetwork();
    networkName = network.network ?? null;
    networkPassphrase = network.networkPassphrase ?? null;
  } catch (error) {
    networkError = normalizeErrorMessage(error, "Unable to read the active wallet network.");
  }

  const normalizedPassphrase = networkPassphrase ?? getExpectedNetworkPassphrase();
  const isExpectedNetwork = normalizedPassphrase === getExpectedNetworkPassphrase();

  let xlmBalance: string | null = null;
  try {
    xlmBalance = await fetchXlmBalance(address);
  } catch {
    // Balance reads are best-effort and should not invalidate the wallet session.
  }

  return createWalletSnapshot({
    status: "connected",
    address,
    ...walletMeta,
    network: normalizeNetworkName(networkName, normalizedPassphrase),
    networkPassphrase: normalizedPassphrase,
    isExpectedNetwork,
    xlmBalance,
    error: networkError,
  });
}

export async function connectWalletWithKit() {
  ensureWalletKitInitialized();

  const response = await StellarWalletsKit.authModal();
  normalizeAddress(response.address);

  return readWalletSnapshot();
}

export async function disconnectActiveWallet() {
  ensureWalletKitInitialized();
  await StellarWalletsKit.disconnect();
}

export async function signWithActiveWallet(transactionXdr: string, address: string) {
  ensureWalletKitInitialized();

  const normalizedAddress = normalizeAddress(address);
  const result = await StellarWalletsKit.signTransaction(transactionXdr, {
    networkPassphrase: getExpectedNetworkPassphrase(),
    address: normalizedAddress,
  });

  if (!result.signedTxXdr) {
    throw new Error("The selected wallet did not return a signed transaction.");
  }

  if (result.signerAddress && result.signerAddress !== normalizedAddress) {
    throw new Error("The selected wallet signed with a different address than the connected account.");
  }

  return result.signedTxXdr;
}

export function subscribeWalletKitEvents(subscriptions: WalletKitEventSubscriptions) {
  ensureWalletKitInitialized();

  const unsubscribe = [
    subscriptions.onStateUpdated
      ? StellarWalletsKit.on(KitEventType.STATE_UPDATED, subscriptions.onStateUpdated)
      : null,
    subscriptions.onWalletSelected
      ? StellarWalletsKit.on(KitEventType.WALLET_SELECTED, subscriptions.onWalletSelected)
      : null,
    subscriptions.onDisconnect
      ? StellarWalletsKit.on(KitEventType.DISCONNECT, subscriptions.onDisconnect)
      : null,
  ].filter((entry): entry is () => void => entry !== null);

  return () => {
    for (const stop of unsubscribe) {
      stop();
    }
  };
}

export async function mountWalletKitButton(
  container: HTMLElement,
  props: SwkButtonProps = {
    mode: ButtonMode.free,
    size: ButtonSize.md,
    classes: "primary-button navbar-btn swk-navbar-button",
  },
) {
  ensureWalletKitInitialized();
  container.replaceChildren();
  await StellarWalletsKit.createButton(container, props);
}