import { Networks } from "@stellar/stellar-sdk";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

const configuredPassphrase =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? TESTNET_PASSPHRASE;

export const appConfig = {
  rpcUrl:
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl:
    process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "TESTNET",
  networkPassphrase: configuredPassphrase,
  contractId: process.env.NEXT_PUBLIC_TALAMBAG_CONTRACT_ID ?? "",
  assetAddress: process.env.NEXT_PUBLIC_TALAMBAG_ASSET_ADDRESS ?? "",
  assetCode: process.env.NEXT_PUBLIC_TALAMBAG_ASSET_CODE ?? "XLM",
  assetDecimals: Number(process.env.NEXT_PUBLIC_TALAMBAG_ASSET_DECIMALS ?? "7"),
  explorerUrl:
    process.env.NEXT_PUBLIC_STELLAR_EXPLORER_URL ??
    "https://stellar.expert/explorer/testnet",
  readAddress: process.env.NEXT_PUBLIC_STELLAR_READ_ADDRESS ?? "",
};

export const networkPassphraseByName: Record<string, string> = {
  TESTNET: Networks.TESTNET,
  PUBLIC: Networks.PUBLIC,
  PUBNET: Networks.PUBLIC,
};

export function getExpectedNetworkPassphrase() {
  return networkPassphraseByName[appConfig.network] ?? appConfig.networkPassphrase;
}

export function hasRequiredConfig() {
  return Boolean(appConfig.contractId && appConfig.rpcUrl);
}
