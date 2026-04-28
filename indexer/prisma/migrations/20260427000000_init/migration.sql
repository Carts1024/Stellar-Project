-- CreateEnum
CREATE TYPE "ContractSource" AS ENUM ('core', 'rewards');

-- CreateTable
CREATE TABLE "indexer_state" (
    "state_key" TEXT NOT NULL,
    "state_value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indexer_state_pkey" PRIMARY KEY ("state_key")
);

-- CreateTable
CREATE TABLE "contract_events" (
    "event_id" TEXT NOT NULL,
    "cursor" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "source" "ContractSource" NOT NULL,
    "event_type" TEXT NOT NULL,
    "group_id" INTEGER,
    "pool_id" INTEGER,
    "actor" TEXT,
    "recipient" TEXT,
    "amount" TEXT,
    "tx_hash" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "contract_events_group_pool_idx"
ON "contract_events" ("group_id", "pool_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "contract_events_ledger_idx"
ON "contract_events" ("ledger" DESC, "event_id" DESC);