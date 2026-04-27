import { EventEmitter } from "node:events";
import { z } from "zod";
import { indexerConfig, trackedContractIds } from "./config.js";
import type { EventIngestionStore } from "./db.js";
import { normalizeRpcEvent } from "./normalize-event.js";
import type { NormalizedContractEvent } from "./types.js";

const jsonRpcEnvelopeSchema = z.object({
  error: z
    .object({
      message: z.string().trim().min(1).optional(),
    })
    .optional(),
  result: z.unknown().optional(),
});

const latestLedgerSchema = z.object({
  sequence: z.number().int().positive(),
});

const rpcEventRecordSchema = z.object({
  contractId: z.string().trim().min(1),
  cursor: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1),
  ledger: z.number().int().positive(),
  ledgerClosedAt: z.string().datetime({ offset: true }),
  pagingToken: z.string().trim().min(1).optional(),
  topic: z.array(z.string().trim().min(1)),
  txHash: z.string().trim().min(1),
  type: z.string().trim().min(1),
  value: z.string().trim().min(1),
});

const rpcEventsResponseSchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  events: z.array(rpcEventRecordSchema),
  latestLedger: z.number().int().positive(),
});

type TalambagIndexerDependencies = {
  eventStore: EventIngestionStore;
  fetchFn?: typeof fetch;
};

async function rpcRequest<T>(
  method: string,
  params: Record<string, unknown>,
  resultSchema: z.ZodType<T>,
  fetchFn: typeof fetch,
) {
  const response = await fetchFn(indexerConfig.INDEXER_STELLAR_RPC_URL, {
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

  const payload = jsonRpcEnvelopeSchema.parse(await response.json());
  if (payload.error) {
    throw new Error(payload.error.message ?? `RPC ${method} failed.`);
  }

  if (payload.result === undefined) {
    throw new Error(`RPC ${method} returned no result.`);
  }

  return resultSchema.parse(payload.result);
}

async function getInitialStartLedger(fetchFn: typeof fetch) {
  if (indexerConfig.INDEXER_START_LEDGER) {
    return indexerConfig.INDEXER_START_LEDGER;
  }

  const latestLedger = await rpcRequest("getLatestLedger", {}, latestLedgerSchema, fetchFn);
  return Math.max(1, latestLedger.sequence - 20);
}

async function getEventsPage(cursor: string | null, startLedger: number | null, fetchFn: typeof fetch) {
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

  return rpcRequest("getEvents", params, rpcEventsResponseSchema, fetchFn);
}

export class TalambagIndexer {
  private readonly eventStore: EventIngestionStore;
  private readonly events = new EventEmitter();
  private readonly fetchFn: typeof fetch;
  private isPolling = false;
  private lastPollAt: string | null = null;
  private lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor({ eventStore, fetchFn = fetch }: TalambagIndexerDependencies) {
    this.eventStore = eventStore;
    this.fetchFn = fetchFn;
  }

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
      let cursor = await this.eventStore.getStoredCursor();
      let startLedger = cursor ? null : await getInitialStartLedger(this.fetchFn);
      let shouldContinue = true;

      while (shouldContinue) {
        const page = await getEventsPage(cursor, startLedger, this.fetchFn);
        const normalized = page.events
          .map((event) => normalizeRpcEvent(event))
          .filter((event): event is NormalizedContractEvent => event !== null);

        const nextCursor =
          page.cursor ?? page.events.at(-1)?.cursor ?? page.events.at(-1)?.pagingToken ?? cursor;

        if (normalized.length > 0 || nextCursor !== cursor) {
          const { insertedEvents } = await this.eventStore.storeEventBatch({
            events: normalized,
            cursor: nextCursor ?? null,
          });

          for (const event of insertedEvents) {
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