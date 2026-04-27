import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import {
  DEFAULT_EVENT_LIST_LIMIT,
  MAX_EVENT_LIST_LIMIT,
} from "./types.js";
import type { ContractEventFilters, JsonValue, NormalizedContractEvent } from "./types.js";

const EVENTS_CURSOR_STATE_KEY = "events_cursor";
const SERIALIZABLE_RETRY_LIMIT = 3;

const contractEventSelect = Prisma.validator<Prisma.ContractEventSelect>()({
  eventId: true,
  cursor: true,
  contractId: true,
  source: true,
  eventType: true,
  groupId: true,
  poolId: true,
  actor: true,
  recipient: true,
  amount: true,
  txHash: true,
  ledger: true,
  occurredAt: true,
  payload: true,
});

type ContractEventRecord = Prisma.ContractEventGetPayload<{
  select: typeof contractEventSelect;
}>;

export type StoreEventBatchInput = Readonly<{
  events: readonly NormalizedContractEvent[];
  cursor: string | null;
}>;

export type StoreEventBatchResult = Readonly<{
  insertedEvents: NormalizedContractEvent[];
  storedCursor: string | null;
}>;

export interface DatabaseLifecycle {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface EventIngestionStore {
  getStoredCursor(): Promise<string | null>;
  storeEventBatch(batch: StoreEventBatchInput): Promise<StoreEventBatchResult>;
}

export interface EventQueryStore {
  listEvents(filters: ContractEventFilters): Promise<NormalizedContractEvent[]>;
}

export interface DatabaseHealthStore {
  getDatabaseHealth(): Promise<string | null>;
}

export interface EventStore
  extends DatabaseLifecycle,
    EventIngestionStore,
    EventQueryStore,
    DatabaseHealthStore {}

function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function clampEventLimit(limit: number | undefined) {
  return Math.min(limit ?? DEFAULT_EVENT_LIST_LIMIT, MAX_EVENT_LIST_LIMIT);
}

function toOccurredAt(value: string) {
  const occurredAt = new Date(value);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error(`Invalid occurredAt value: ${value}`);
  }

  return occurredAt;
}

function toCreateInput(event: NormalizedContractEvent): Prisma.ContractEventUncheckedCreateInput {
  return {
    eventId: event.eventId,
    cursor: event.cursor,
    contractId: event.contractId,
    source: event.source,
    eventType: event.eventType,
    groupId: event.groupId,
    poolId: event.poolId,
    actor: event.actor,
    recipient: event.recipient,
    amount: event.amount,
    txHash: event.txHash,
    ledger: event.ledger,
    occurredAt: toOccurredAt(event.occurredAt),
    payload: event.payload as Prisma.InputJsonValue,
  };
}

function toNormalizedContractEvent(row: ContractEventRecord): NormalizedContractEvent {
  return {
    eventId: row.eventId,
    cursor: row.cursor,
    contractId: row.contractId,
    source: row.source,
    eventType: row.eventType,
    groupId: row.groupId,
    poolId: row.poolId,
    actor: row.actor,
    recipient: row.recipient,
    amount: row.amount,
    txHash: row.txHash,
    ledger: row.ledger,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload as JsonValue,
  };
}

export class PrismaEventStore implements EventStore {
  constructor(private readonly client: typeof prisma = prisma) {}

  async connect() {
    await this.client.$connect();
  }

  async disconnect() {
    await this.client.$disconnect();
  }

  async getStoredCursor() {
    const state = await this.client.indexerState.findUnique({
      where: { stateKey: EVENTS_CURSOR_STATE_KEY },
      select: { stateValue: true },
    });

    return state?.stateValue ?? null;
  }

  async storeEventBatch(batch: StoreEventBatchInput): Promise<StoreEventBatchResult> {
    const insertedEvents = await this.runSerializableTransaction(async (transactionClient) => {
      const persistedEvents: NormalizedContractEvent[] = [];

      for (const event of batch.events) {
        try {
          await transactionClient.contractEvent.create({
            data: toCreateInput(event),
            select: { eventId: true },
          });
          persistedEvents.push(event);
        } catch (error) {
          if (!hasPrismaErrorCode(error, "P2002")) {
            throw error;
          }
        }
      }

      if (batch.cursor !== null) {
        await transactionClient.indexerState.upsert({
          where: { stateKey: EVENTS_CURSOR_STATE_KEY },
          create: {
            stateKey: EVENTS_CURSOR_STATE_KEY,
            stateValue: batch.cursor,
          },
          update: {
            stateValue: batch.cursor,
          },
        });
      }

      return persistedEvents;
    });

    return {
      insertedEvents,
      storedCursor: batch.cursor,
    };
  }

  async listEvents(filters: ContractEventFilters) {
    const events = await this.client.contractEvent.findMany({
      where: {
        eventType: filters.eventTypes ? { in: [...filters.eventTypes] } : undefined,
        groupId: filters.groupId,
        poolId: filters.poolId,
      },
      orderBy: [{ ledger: "desc" }, { eventId: "desc" }],
      take: clampEventLimit(filters.limit),
      select: contractEventSelect,
    });

    return events.map(toNormalizedContractEvent);
  }

  async getDatabaseHealth() {
    const result = await this.client.$queryRaw<Array<{ now: string }>>`SELECT NOW()::text AS now`;
    return result[0]?.now ?? null;
  }

  private async runSerializableTransaction<T>(
    operation: (transactionClient: Prisma.TransactionClient) => Promise<T>,
  ) {
    let attempt = 0;

    while (attempt < SERIALIZABLE_RETRY_LIMIT) {
      try {
        return await this.client.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        attempt += 1;

        if (!hasPrismaErrorCode(error, "P2034") || attempt >= SERIALIZABLE_RETRY_LIMIT) {
          throw error;
        }
      }
    }

    throw new Error("Failed to persist the event batch after retrying the transaction.");
  }
}

export const eventStore = new PrismaEventStore();