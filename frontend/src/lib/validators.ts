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

export function parsePositiveIntegerParam(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (typeof normalized !== "string") {
    return null;
  }

  const trimmed = normalized.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}
