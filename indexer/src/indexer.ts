import { EventEmitter } from "node:events";
import { indexerConfig, trackedContractIds } from "./config.js";
import { getStoredCursor, storeEventBatch } from "./db.js";
import { normalizeRpcEvent } from "./normalize-event.js";
import type { NormalizedContractEvent, RpcEventsResponse } from "./types.js";

type JsonRpcResponse<T> = {
  error?: {
    message?: string;
  };
  result?: T;
};

async function rpcRequest<T>(method: string, params: Record<string, unknown>) {
  const response = await fetch(indexerConfig.INDEXER_STELLAR_RPC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) {
    throw new Error(payload.error.message ?? `RPC ${method} failed.`);
  }

  if (!payload.result) {
    throw new Error(`RPC ${method} returned no result.`);
  }

  return payload.result;
}

async function getInitialStartLedger() {
  if (indexerConfig.INDEXER_START_LEDGER) {
    return indexerConfig.INDEXER_START_LEDGER;
  }

  const latestLedger = await rpcRequest<{ sequence: number }>("getLatestLedger", {});
  return Math.max(1, latestLedger.sequence - 20);
}

async function getEventsPage(cursor: string | null, startLedger: number | null) {
  const params: Record<string, unknown> = {
    filters: [
      {
        type: "contract",
        contractIds: trackedContractIds,
      },
    ],
    pagination: {
      limit: indexerConfig.INDEXER_BATCH_LIMIT,
    },
    xdrFormat: "base64",
  };

  if (cursor) {
    params.pagination = {
      cursor,
      limit: indexerConfig.INDEXER_BATCH_LIMIT,
    };
  } else if (startLedger !== null) {
    params.startLedger = startLedger;
  }

  return rpcRequest<RpcEventsResponse>("getEvents", params);
}

export class TalambagIndexer {
  private readonly events = new EventEmitter();
  private isPolling = false;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  async start() {
    await this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, indexerConfig.INDEXER_POLL_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onEvent(listener: (event: NormalizedContractEvent) => void) {
    this.events.on("contract-event", listener);
    return () => this.events.off("contract-event", listener);
  }

  getStatus() {
    return {
      isPolling: this.isPolling,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
    };
  }

  private async poll() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      let cursor = await getStoredCursor();
      let startLedger = cursor ? null : await getInitialStartLedger();
      let shouldContinue = true;

      while (shouldContinue) {
        const page = await getEventsPage(cursor, startLedger);
        const normalized = page.events
          .map((event) => normalizeRpcEvent(event))
          .filter((event): event is NormalizedContractEvent => event !== null);

        const nextCursor =
          page.cursor ?? page.events.at(-1)?.cursor ?? page.events.at(-1)?.pagingToken ?? cursor;

        if (normalized.length > 0 || nextCursor !== cursor) {
          await storeEventBatch(normalized, nextCursor ?? null);

          for (const event of normalized) {
            this.events.emit("contract-event", event);
          }
        }

        shouldContinue =
          Boolean(nextCursor && nextCursor !== cursor) &&
          page.events.length >= indexerConfig.INDEXER_BATCH_LIMIT;

        cursor = nextCursor ?? cursor;
        startLedger = null;
      }

      this.lastPollAt = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.isPolling = false;
    }
  }
}