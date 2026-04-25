"use client";

import {
  type KitEventDisconnected,
  type KitEventStateUpdated,
  type KitEventWalletSelected,
  type Networks,
  type SwkAppTheme,
} from "@creit-tech/stellar-wallets-kit/types";
import { Horizon } from "@stellar/stellar-sdk";
import { appConfig, getExpectedNetworkPassphrase } from "@/lib/config";
import type { WalletSnapshot } from "@/lib/types";
import { isValidStellarAddress } from "@/lib/validators";

const KIT_NETWORKS = {
  PUBLIC: "Public Global Stellar Network ; September 2015",
  TESTNET: "Test SDF Network ; September 2015",
  FUTURENET: "Test SDF Future Network ; October 2022",
  SANDBOX: "Local Sandbox Stellar Network ; September 2022",
  STANDALONE: "Standalone Network ; February 2017",
} as const;

type KitNetworkPassphrase = (typeof KIT_NETWORKS)[keyof typeof KIT_NETWORKS];

type WalletKitRuntime = {
  StellarWalletsKit: typeof import("@creit-tech/stellar-wallets-kit/sdk").StellarWalletsKit;
  defaultModules: typeof import("@creit-tech/stellar-wallets-kit/modules/utils").defaultModules;
  KitEventType: typeof import("@creit-tech/stellar-wallets-kit/types").KitEventType;
};

const networkLabelByPassphrase = new Map<string, string>([
  [KIT_NETWORKS.PUBLIC, "PUBLIC"],
  [KIT_NETWORKS.TESTNET, "TESTNET"],
  [KIT_NETWORKS.FUTURENET, "FUTURENET"],
  [KIT_NETWORKS.SANDBOX, "SANDBOX"],
  [KIT_NETWORKS.STANDALONE, "STANDALONE"],
]);

const kitTheme: SwkAppTheme = {
  background: "rgba(253, 250, 244, 0.97)",
  "background-secondary": "rgba(248, 244, 234, 0.98)",
  "foreground-strong": "#17251f",
  foreground: "#24352d",
  "foreground-secondary": "#59675f",
  primary: "#0f766e",
  "primary-foreground": "#ffffff",
  transparent: "rgba(255, 255, 255, 0)",
  lighter: "#ffffff",
  light: "rgba(255, 255, 255, 0.65)",
  "light-gray": "rgba(23, 37, 31, 0.06)",
  gray: "#8a958d",
  danger: "#c75b4f",
  border: "rgba(23, 37, 31, 0.08)",
  shadow: "0 20px 60px rgba(0, 0, 0, 0.16), 0 4px 16px rgba(0, 0, 0, 0.06)",
  "border-radius": "1.5rem",
  "font-family": '"Inter", "Segoe UI", system-ui, sans-serif',
};

let walletKitInitialized = false;
let walletKitRuntimePromise: Promise<WalletKitRuntime> | null = null;
let walletKitInitializationPromise: Promise<void> | null = null;

type WalletErrorContext = "connect" | "network" | "sign";

type WalletKitEventSubscriptions = {
  onDisconnect?: (event: KitEventDisconnected) => void;
  onStateUpdated?: (event: KitEventStateUpdated) => void;
  onWalletSelected?: (event: KitEventWalletSelected) => void;
};

type WalletNetworkResolution = {
  network: string | null;
  networkPassphrase: string | null;
  isExpectedNetwork: boolean;
  isNetworkVerified: boolean;
  error?: string;
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
    isNetworkVerified: false,
    xlmBalance: null,
    ...overrides,
  };
}

async function loadWalletKitRuntime(): Promise<WalletKitRuntime> {
  if (!walletKitRuntimePromise) {
    walletKitRuntimePromise = Promise.all([
      import("@creit-tech/stellar-wallets-kit/sdk"),
      import("@creit-tech/stellar-wallets-kit/modules/utils"),
      import("@creit-tech/stellar-wallets-kit/types"),
    ]).then(([sdkModule, utilsModule, typesModule]) => ({
      StellarWalletsKit: sdkModule.StellarWalletsKit,
      defaultModules: utilsModule.defaultModules,
      KitEventType: typesModule.KitEventType,
    }));
  }

  return walletKitRuntimePromise;
}

function getKitNetwork(): KitNetworkPassphrase {
  const expectedPassphrase = getExpectedNetworkPassphrase();
  const configuredName = appConfig.network.trim().toUpperCase();

  if (expectedPassphrase === KIT_NETWORKS.PUBLIC || configuredName === "PUBLIC" || configuredName === "PUBNET") {
    return KIT_NETWORKS.PUBLIC;
  }

  if (expectedPassphrase === KIT_NETWORKS.FUTURENET || configuredName === "FUTURENET") {
    return KIT_NETWORKS.FUTURENET;
  }

  if (expectedPassphrase === KIT_NETWORKS.SANDBOX || configuredName === "SANDBOX") {
    return KIT_NETWORKS.SANDBOX;
  }

  if (expectedPassphrase === KIT_NETWORKS.STANDALONE || configuredName === "STANDALONE") {
    return KIT_NETWORKS.STANDALONE;
  }

  return KIT_NETWORKS.TESTNET;
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}

function normalizeWalletError(error: unknown, context: WalletErrorContext, fallback: string) {
  const message = normalizeErrorMessage(error, fallback);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("user closed the modal") ||
    normalized.includes("rejected") ||
    normalized.includes("denied") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    if (context === "sign") {
      return "The signature request was canceled in the wallet.";
    }

    return "The wallet connection request was canceled.";
  }

  if (
    normalized.includes("no wallet has been connected") ||
    normalized.includes("needs to authenticate first") ||
    normalized.includes("set the wallet first")
  ) {
    return "Connect a wallet before continuing.";
  }

  if (
    normalized.includes("not available") ||
    normalized.includes("not installed") ||
    normalized.includes("install")
  ) {
    return "The selected wallet is not available in this browser. Install or open a supported wallet and try again.";
  }

  if (context === "network" && normalized.includes("network")) {
    return "The wallet is connected, but the active network details could not be read.";
  }

  return message;
}

function normalizeAddress(address: string) {
  const trimmedAddress = address.trim();

  if (!isValidStellarAddress(trimmedAddress)) {
    throw new Error("The selected wallet returned an invalid Stellar address.");
  }

  return trimmedAddress;
}

async function readSelectedWalletMeta() {
  const { StellarWalletsKit } = await loadWalletKitRuntime();

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

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function isUnsupportedNetworkReadError(error: unknown) {
  const normalizedMessage = normalizeErrorMessage(error, "").toLowerCase();

  return (
    normalizedMessage.includes("does not support the \"getnetwork\" function") ||
    normalizedMessage.includes("does not support the \"getnetwork\" method") ||
    normalizedMessage.includes("does not support the getnetwork function") ||
    normalizedMessage.includes("does not support the getnetwork method") ||
    normalizedMessage.includes("getnetwork") && normalizedMessage.includes("does not support")
  );
}

function createConfiguredNetworkResolution(): WalletNetworkResolution {
  const expectedPassphrase = getExpectedNetworkPassphrase();

  return {
    network: normalizeNetworkName(appConfig.network, expectedPassphrase),
    networkPassphrase: expectedPassphrase,
    isExpectedNetwork: true,
    isNetworkVerified: false,
  };
}

async function readWalletAddress(): Promise<string | null> {
  const { StellarWalletsKit } = await loadWalletKitRuntime();

  try {
    const response = await StellarWalletsKit.getAddress();
    return normalizeAddress(response.address);
  } catch {
    return null;
  }
}

async function readWalletNetworkResolution(): Promise<WalletNetworkResolution> {
  const { StellarWalletsKit } = await loadWalletKitRuntime();

  try {
    const response = await StellarWalletsKit.getNetwork();
    const networkPassphrase = normalizeOptionalString(response.networkPassphrase);

    if (!networkPassphrase) {
      throw new Error("The wallet returned an empty network passphrase.");
    }

    return {
      network: normalizeNetworkName(normalizeOptionalString(response.network), networkPassphrase),
      networkPassphrase,
      isExpectedNetwork: networkPassphrase === getExpectedNetworkPassphrase(),
      isNetworkVerified: true,
    };
  } catch (error) {
    if (isUnsupportedNetworkReadError(error)) {
      return createConfiguredNetworkResolution();
    }

    return {
      network: null,
      networkPassphrase: null,
      isExpectedNetwork: false,
      isNetworkVerified: false,
      error: normalizeWalletError(error, "network", "Unable to read the active wallet network."),
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

export async function ensureWalletKitInitialized() {
  if (walletKitInitialized || typeof window === "undefined") {
    return;
  }

  if (!walletKitInitializationPromise) {
    walletKitInitializationPromise = (async () => {
      const { StellarWalletsKit, defaultModules } = await loadWalletKitRuntime();

      StellarWalletsKit.init({
        modules: defaultModules(),
        network: getKitNetwork() as Networks,
        theme: kitTheme,
        authModal: {
          showInstallLabel: true,
          hideUnsupportedWallets: false,
        },
      });

      walletKitInitialized = true;
    })().catch((error) => {
      walletKitInitializationPromise = null;
      throw error;
    });
  }

  await walletKitInitializationPromise;
}

export async function fetchXlmBalance(address: string): Promise<string> {
  const server = new Horizon.Server(appConfig.horizonUrl);
  const account = await server.loadAccount(address);
  const native = account.balances.find((balance) => balance.asset_type === "native");
  return native?.balance ?? "0";
}

export async function readWalletSnapshot(): Promise<WalletSnapshot> {
  await ensureWalletKitInitialized();

  const walletMeta = await readSelectedWalletMeta();

  const address = await readWalletAddress();

  if (!address) {
    return createWalletSnapshot(walletMeta);
  }

  const networkResolution = await readWalletNetworkResolution();

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
    network: networkResolution.network,
    networkPassphrase: networkResolution.networkPassphrase,
    isExpectedNetwork: networkResolution.isExpectedNetwork,
    isNetworkVerified: networkResolution.isNetworkVerified,
    xlmBalance,
    error: networkResolution.error,
  });
}

export async function connectWalletWithKit() {
  await ensureWalletKitInitialized();

  const { StellarWalletsKit } = await loadWalletKitRuntime();

  try {
    const response = await StellarWalletsKit.authModal();
    normalizeAddress(response.address);
    return readWalletSnapshot();
  } catch (error) {
    throw new Error(
      normalizeWalletError(error, "connect", "Unable to connect the selected wallet."),
    );
  }
}

export async function disconnectActiveWallet() {
  await ensureWalletKitInitialized();

  const { StellarWalletsKit } = await loadWalletKitRuntime();
  await StellarWalletsKit.disconnect();
}

export async function signWithActiveWallet(transactionXdr: string, address: string) {
  await ensureWalletKitInitialized();

  const { StellarWalletsKit } = await loadWalletKitRuntime();

  const normalizedAddress = normalizeAddress(address);

  try {
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
  } catch (error) {
    throw new Error(
      normalizeWalletError(error, "sign", "The transaction could not be signed by the selected wallet."),
    );
  }
}

export async function subscribeWalletKitEvents(subscriptions: WalletKitEventSubscriptions) {
  await ensureWalletKitInitialized();

  const { StellarWalletsKit, KitEventType } = await loadWalletKitRuntime();

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

