"use client";

import { appConfig } from "@/lib/config";
import { fetchPoolEvents } from "@/lib/talambag-client";
import type { PoolEvent } from "@/lib/types";

type IndexedEvent = {
  actor: string | null;
  amount: string | null;
  eventId: string;
  eventType: string;
  occurredAt: string;
  recipient: string | null;
  txHash: string;
};

function normalizeIndexedEvent(event: IndexedEvent): PoolEvent | null {
  if (event.eventType !== "deposit" && event.eventType !== "withdraw") {
    return null;
  }

  if (!event.actor || !event.amount) {
    return null;
  }

  return {
    eventId: event.eventId,
    type: event.eventType,
    from: event.actor,
    to: event.recipient ?? undefined,
    amount: BigInt(event.amount),
    timestamp: event.occurredAt,
    txHash: event.txHash,
  };
}

export async function fetchRealtimePoolEvents(groupId: number, poolId: number) {
  if (!appConfig.indexerUrl) {
    return fetchPoolEvents(groupId, poolId);
  }

  const url = new URL("/events", appConfig.indexerUrl);
  url.searchParams.set("groupId", String(groupId));
  url.searchParams.set("poolId", String(poolId));
  url.searchParams.set("limit", "200");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Realtime event API returned HTTP ${response.status}`);
  }

  const json = (await response.json()) as { events: IndexedEvent[] };

  return json.events
    .map((event) => normalizeIndexedEvent(event))
    .filter((event): event is PoolEvent => event !== null);
}

export function subscribeToPoolEvents(
  groupId: number,
  poolId: number,
  onEvent: (event: PoolEvent) => void,
) {
  if (!appConfig.indexerUrl || typeof EventSource === "undefined") {
    return () => undefined;
  }

  const url = new URL("/events/stream", appConfig.indexerUrl);
  url.searchParams.set("groupId", String(groupId));
  url.searchParams.set("poolId", String(poolId));

  const source = new EventSource(url.toString());
  source.onmessage = (message) => {
    const event = normalizeIndexedEvent(JSON.parse(message.data) as IndexedEvent);
    if (event) {
      onEvent(event);
    }
  };

  return () => {
    source.close();
  };
}