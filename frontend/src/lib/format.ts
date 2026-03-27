const TEN = 10n;

export function parseAmountToInt(amount: string, decimals: number): bigint {
  const normalized = amount.trim();
  if (!normalized) {
    throw new Error("Enter an amount before submitting.");
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Use numbers only, for example 12 or 12.5.");
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > decimals) {
    throw new Error(`Use at most ${decimals} decimal places for this asset.`);
  }

  const whole = BigInt(wholePart);
  const paddedFraction = fractionPart.padEnd(decimals, "0");
  const fraction = paddedFraction ? BigInt(paddedFraction) : 0n;
  const base = TEN ** BigInt(decimals);
  const result = whole * base + fraction;

  if (result <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return result;
}

export function formatAmount(value: bigint | number | string | null, decimals: number) {
  if (value === null) {
    return "0";
  }

  const bigintValue =
    typeof value === "bigint" ? value : BigInt(typeof value === "number" ? Math.trunc(value) : value);
  const negative = bigintValue < 0n;
  const absolute = negative ? bigintValue * -1n : bigintValue;
  const base = TEN ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;

  if (fraction === 0n) {
    return `${negative ? "-" : ""}${whole.toString()}`;
  }

  const trimmedFraction = fraction
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole.toString()}.${trimmedFraction}`;
}

export function shortenAddress(address: string | null, size = 6) {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, size)}...${address.slice(-size)}`;
}
