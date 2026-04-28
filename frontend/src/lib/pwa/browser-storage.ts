const BIGINT_SENTINEL = "__talambag_bigint__";

type BigIntRecord = {
  __type: typeof BIGINT_SENTINEL;
  value: string;
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function replacer(_key: string, value: unknown) {
  if (typeof value === "bigint") {
    return {
      __type: BIGINT_SENTINEL,
      value: value.toString(),
    } satisfies BigIntRecord;
  }

  return value;
}

function reviver(_key: string, value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "__type" in value &&
    value.__type === BIGINT_SENTINEL &&
    "value" in value &&
    typeof value.value === "string"
  ) {
    return BigInt(value.value);
  }

  return value;
}

export function readStoredValue<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw, reviver) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeStoredValue(key: string, value: unknown) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value, replacer));
  } catch {
    // Ignore quota and storage availability failures.
  }
}

export function removeStoredValue(key: string) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage failures during cleanup.
  }
}