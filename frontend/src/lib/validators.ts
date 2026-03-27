import { Address } from "@stellar/stellar-sdk";

export function isValidStellarAddress(value: string) {
  try {
    Address.fromString(value.trim());
    return true;
  } catch {
    return false;
  }
}
