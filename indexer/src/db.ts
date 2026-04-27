import { Pool } from "pg";
import { indexerConfig } from "./config.js";
import type { NormalizedContractEvent, PoolEventFilters } from "./types.js";

type ContractEventRow = {
  actor: string | null;
  amount: string | null;
  contract_id: string;
  cursor: string;
  event_id: string;
  event_type: string;
  group_id: number | null;
  ledger: number;
  occurred_at: string | Date;
  payload: NormalizedContractEvent["payload"];
  pool_id: number | null;
  recipient: string | null;
  source: "core" | "rewards";
  tx_hash: string;
};

const pool = new Pool({
  connectionString: indexerConfig.INDEXER_DATABASE_URL,
  ssl: indexerConfig.INDEXER_DATABASE_URL.includes("sslmode=disable")
    ? false
    : { rejectUnauthorized: false },
});

const CREATE_CURSOR_TABLE = `
  CREATE TABLE IF NOT EXISTS indexer_state (
    state_key TEXT PRIMARY KEY,
    state_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS contract_events (
    event_id TEXT PRIMARY KEY,
    cursor TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    group_id INTEGER,
    pool_id INTEGER,
    actor TEXT,
    recipient TEXT,
    amount TEXT,
    tx_hash TEXT NOT NULL,
    ledger INTEGER NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS contract_events_group_pool_idx
    ON contract_events (group_id, pool_id, occurred_at DESC);

  CREATE INDEX IF NOT EXISTS contract_events_ledger_idx
    ON contract_events (ledger DESC, event_id DESC);
`;

export async function ensureDatabase() {
  await pool.query(CREATE_CURSOR_TABLE);
  await pool.query(CREATE_EVENTS_TABLE);
}

export async function getStoredCursor() {
  const result = await pool.query<{ state_value: string }>(
    `SELECT state_value FROM indexer_state WHERE state_key = 'events_cursor'`,
  );

  return result.rows[0]?.state_value ?? null;
}

export async function storeEventBatch(events: NormalizedContractEvent[], cursor: string | null) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const event of events) {
      await client.query(
        `
          INSERT INTO contract_events (
            event_id,
            cursor,
            contract_id,
            source,
            event_type,
            group_id,
            pool_id,
            actor,
            recipient,
            amount,
            tx_hash,
            ledger,
            occurred_at,
            payload
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
          )
          ON CONFLICT (event_id) DO NOTHING
        `,
        [
          event.eventId,
          event.cursor,
          event.contractId,
          event.source,
          event.eventType,
          event.groupId,
          event.poolId,
          event.actor,
          event.recipient,
          event.amount,
          event.txHash,
          event.ledger,
          event.occurredAt,
          JSON.stringify(event.payload),
        ],
      );
    }

    if (cursor) {
      await client.query(
        `
          INSERT INTO indexer_state (state_key, state_value)
          VALUES ('events_cursor', $1)
          ON CONFLICT (state_key)
          DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = NOW()
        `,
        [cursor],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listEvents(filters: PoolEventFilters) {
  const limit = Math.min(filters.limit ?? 100, 200);
  const params: Array<number> = [];
  const where: string[] = [];

  if (filters.groupId !== undefined) {
    params.push(filters.groupId);
    where.push(`group_id = $${params.length}`);
  }

  if (filters.poolId !== undefined) {
    params.push(filters.poolId);
    where.push(`pool_id = $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  params.push(limit);

  const result = await pool.query<ContractEventRow>(
    `
      SELECT
        event_id,
        cursor,
        contract_id,
        source,
        event_type,
        group_id,
        pool_id,
        actor,
        recipient,
        amount,
        tx_hash,
        ledger,
        occurred_at,
        payload
      FROM contract_events
      ${whereClause}
      ORDER BY ledger DESC, event_id DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row: ContractEventRow) => ({
    eventId: String(row.event_id),
    cursor: String(row.cursor),
    contractId: String(row.contract_id),
    source: row.source as "core" | "rewards",
    eventType: String(row.event_type),
    groupId: row.group_id === null ? null : Number(row.group_id),
    poolId: row.pool_id === null ? null : Number(row.pool_id),
    actor: row.actor === null ? null : String(row.actor),
    recipient: row.recipient === null ? null : String(row.recipient),
    amount: row.amount === null ? null : String(row.amount),
    txHash: String(row.tx_hash),
    ledger: Number(row.ledger),
    occurredAt: new Date(row.occurred_at as string | Date).toISOString(),
    payload: row.payload as NormalizedContractEvent["payload"],
  })) satisfies NormalizedContractEvent[];
}

export async function getDatabaseHealth() {
  const result = await pool.query<{ now: string }>("SELECT NOW()::text AS now");
  return result.rows[0]?.now ?? null;
}