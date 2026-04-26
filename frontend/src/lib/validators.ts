import { Address } from "@stellar/stellar-sdk";

export function isValidStellarAddress(value: string) {
  try {
    Address.fromString(value.trim());
    return true;
  } catch {
    return false;
  }
}

export function requireText(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}
