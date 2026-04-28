"use client";

import { invalidateCached, invalidateCachedByPrefix } from "@/lib/cache";
import { appConfig } from "@/lib/config";
import { fetchPoolEvents } from "@/lib/talambag-client";
import {
  POOL_ACTIVITY_REALTIME_EVENT_TYPES,
  SUPPORTED_REALTIME_EVENT_TYPES,
} from "@/lib/types";
import type {
  PoolActivityRealtimeEvent,
  PoolEvent,
  RealtimeContractEvent,
  RealtimeEventFilters,
  SupportedRealtimeEventType,
} from "@/lib/types";

type IndexedEvent = {
  actor?: unknown;
  amount?: unknown;
  eventId?: unknown;
  eventType?: unknown;
  groupId?: unknown;
  occurredAt?: unknown;
  poolId?: unknown;
  recipient?: unknown;
  txHash?: unknown;
};

const SUPPORTED_REALTIME_EVENT_TYPE_SET = new Set<SupportedRealtimeEventType>(
  SUPPORTED_REALTIME_EVENT_TYPES,
);
const POOL_ACTIVITY_REALTIME_EVENT_TYPE_SET = new Set<SupportedRealtimeEventType>(
  POOL_ACTIVITY_REALTIME_EVENT_TYPES,
);

function normalizeText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalText(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return normalizeText(value) ?? undefined;
}

function normalizePositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizePositiveAmount(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized || !/^-?\d+$/.test(normalized)) {
    return null;
  }

  try {
    const amount = BigInt(normalized);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

function normalizeTimestamp(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const timestamp = new Date(normalized);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

function isSupportedRealtimeEventType(value: string): value is SupportedRealtimeEventType {
  return SUPPORTED_REALTIME_EVENT_TYPE_SET.has(value as SupportedRealtimeEventType);
}

function canUsePoolHistoryFallback(
  filters: RealtimeEventFilters,
): filters is RealtimeEventFilters & Readonly<{ groupId: number; poolId: number }> {
  if (filters.groupId === undefined || filters.poolId === undefined) {
    return false;
  }

  return (
    !filters.eventTypes ||
    filters.eventTypes.every((eventType) => POOL_ACTIVITY_REALTIME_EVENT_TYPE_SET.has(eventType))
  );
}

function appendFiltersToUrl(url: URL, filters: RealtimeEventFilters, includeLimit: boolean) {
  if (filters.groupId !== undefined) {
    url.searchParams.set("groupId", String(filters.groupId));
  }

  if (filters.poolId !== undefined) {
    url.searchParams.set("poolId", String(filters.poolId));
  }

  if (includeLimit && filters.limit !== undefined) {
    url.searchParams.set("limit", String(filters.limit));
  }

  for (const eventType of filters.eventTypes ?? []) {
    url.searchParams.append("eventType", eventType);
  }
}

function normalizeIndexedEvent(event: IndexedEvent): RealtimeContractEvent | null {
  const eventType = normalizeText(event.eventType);
  const groupId = normalizePositiveInteger(event.groupId);
  const timestamp = normalizeTimestamp(event.occurredAt);

  if (!eventType || !isSupportedRealtimeEventType(eventType) || groupId === null || !timestamp) {
    return null;
  }

  const baseEvent = {
    eventId: normalizeOptionalText(event.eventId),
    groupId,
    timestamp,
    txHash: normalizeOptionalText(event.txHash),
  };
  const actor = normalizeText(event.actor);

  switch (eventType) {
    case "group_created":
    case "member_added":
      return actor
        ? {
            ...baseEvent,
            actor,
            type: eventType,
          }
        : null;
    case "pool_created": {
      const poolId = normalizePositiveInteger(event.poolId);
      return actor && poolId !== null
        ? {
            ...baseEvent,
            actor,
            poolId,
            type: eventType,
          }
        : null;
    }
    case "deposit": {
      const amount = normalizePositiveAmount(event.amount);
      const poolId = normalizePositiveInteger(event.poolId);
      return actor && amount !== null && poolId !== null
        ? {
            ...baseEvent,
            actor,
            amount,
            poolId,
            type: eventType,
          }
        : null;
    }
    case "withdraw": {
      const amount = normalizePositiveAmount(event.amount);
      const poolId = normalizePositiveInteger(event.poolId);
      const recipient = normalizeText(event.recipient);
      return actor && amount !== null && poolId !== null && recipient
        ? {
            ...baseEvent,
            actor,
            amount,
            poolId,
            recipient,
            type: eventType,
          }
        : null;
    }
  }
}

function toRealtimePoolEvent(groupId: number, poolId: number, event: PoolEvent): PoolActivityRealtimeEvent | null {
  if (event.type === "deposit") {
    return {
      amount: event.amount,
      actor: event.from,
      eventId: event.eventId,
      groupId,
      poolId,
      timestamp: event.timestamp,
      txHash: event.txHash,
      type: "deposit",
    };
  }

  const recipient = event.to;
  if (!recipient) {
    return null;
  }

  return {
    amount: event.amount,
    actor: event.from,
    eventId: event.eventId,
    groupId,
    poolId,
    recipient,
    timestamp: event.timestamp,
    txHash: event.txHash,
    type: "withdraw",
  };
}

export async function fetchContractEvents(filters: RealtimeEventFilters): Promise<RealtimeContractEvent[]> {
  if (!appConfig.indexerUrl) {
    if (!canUsePoolHistoryFallback(filters)) {
      return [];
    }

    const events = await fetchPoolEvents(filters.groupId, filters.poolId);
    const realtimeEvents = events
      .map((event) => toRealtimePoolEvent(filters.groupId, filters.poolId, event))
      .filter((event): event is PoolActivityRealtimeEvent => event !== null);

    if (!filters.eventTypes) {
      return realtimeEvents.slice(0, filters.limit ?? realtimeEvents.length);
    }

    return realtimeEvents
      .filter((event) => filters.eventTypes?.includes(event.type) ?? true)
      .slice(0, filters.limit ?? realtimeEvents.length);
  }

  const url = new URL("/events", appConfig.indexerUrl);
  appendFiltersToUrl(url, filters, true);

  let response: Response;

  try {
    response = await fetch(url.toString());
  } catch {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Realtime event API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as { events: IndexedEvent[] };

  return json.events
    .map((event) => normalizeIndexedEvent(event))
    .filter((event): event is RealtimeContractEvent => event !== null);
}

export function subscribeToContractEvents(
  filters: Readonly<Omit<RealtimeEventFilters, "limit">>,
  onEvent: (event: RealtimeContractEvent) => void,
) {
  if (
    !appConfig.indexerUrl ||
    typeof EventSource === "undefined" ||
    typeof window === "undefined"
  ) {
    return () => undefined;
  }

  const url = new URL("/events/stream", appConfig.indexerUrl);
  appendFiltersToUrl(url, filters, false);

  let reconnectTimerId: ReturnType<typeof setTimeout> | null = null;
  let source: EventSource | null = null;

  function clearReconnectTimer() {
    if (reconnectTimerId !== null) {
      clearTimeout(reconnectTimerId);
      reconnectTimerId = null;
    }
  }

  function closeSource() {
    if (source) {
      source.close();
      source = null;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimerId !== null || !navigator.onLine) {
      return;
    }

    reconnectTimerId = setTimeout(() => {
      reconnectTimerId = null;
      connect();
    }, 1_500);
  }

  function connect() {
    if (!navigator.onLine || source) {
      return;
    }

    source = new EventSource(url.toString());
    source.onmessage = (message) => {
      try {
        const event = normalizeIndexedEvent(JSON.parse(message.data) as IndexedEvent);
        if (event) {
          onEvent(event);
        }
      } catch {
        // Ignore malformed stream payloads and keep the subscription alive.
      }
    };
    source.onerror = () => {
      closeSource();
      scheduleReconnect();
    };
  }

  function handleOnline() {
    clearReconnectTimer();
    connect();
  }

  function handleOffline() {
    clearReconnectTimer();
    closeSource();
  }

  connect();
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    clearReconnectTimer();
    closeSource();
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

export function toPoolEvent(event: PoolActivityRealtimeEvent): PoolEvent {
  return event.type === "deposit"
    ? {
        amount: event.amount,
        eventId: event.eventId,
        from: event.actor,
        timestamp: event.timestamp,
        txHash: event.txHash,
        type: "deposit",
      }
    : {
        amount: event.amount,
        eventId: event.eventId,
        from: event.actor,
        timestamp: event.timestamp,
        to: event.recipient,
        txHash: event.txHash,
        type: "withdraw",
      };
}

export function toPoolEvents(events: readonly RealtimeContractEvent[]): PoolEvent[] {
  return events
    .filter((event): event is PoolActivityRealtimeEvent => POOL_ACTIVITY_REALTIME_EVENT_TYPE_SET.has(event.type))
    .map((event) => toPoolEvent(event));
}

export function appendUniquePoolEvent(current: readonly PoolEvent[], next: PoolEvent): PoolEvent[] {
  if (
    current.some(
      (existing) =>
        existing.eventId === next.eventId ||
        (existing.txHash === next.txHash &&
          existing.type === next.type &&
          existing.timestamp === next.timestamp),
    )
  ) {
    return [...current];
  }

  return [next, ...current];
}

export function invalidateDashboardCachesForEvent(event: RealtimeContractEvent) {
  invalidateCached("group_count", `group:${event.groupId}`);
}

export function invalidateGroupCachesForEvent(event: RealtimeContractEvent) {
  switch (event.type) {
    case "group_created":
    case "member_added":
    case "pool_created":
      invalidateCached(`group:${event.groupId}`);
      if (event.type === "member_added") {
        invalidateCachedByPrefix(`membership:${event.groupId}:`);
      }
      break;
    case "deposit":
    case "withdraw":
      invalidateCached(`pool:${event.groupId}:${event.poolId}`);
      break;
  }
}

export function invalidatePoolCachesForEvent(event: PoolActivityRealtimeEvent) {
  invalidateCached(`pool:${event.groupId}:${event.poolId}`);
}