CREATE TABLE "gas_operations" (
    "operation_id" UUID NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "transaction_hash" TEXT NOT NULL,
    "request_id" TEXT,
    "status" VARCHAR(32) NOT NULL,
    "outer_transaction_hash" TEXT,
    "reserved_stroops" TEXT,
    "actual_fee_stroops" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "reconciliation_required" BOOLEAN NOT NULL DEFAULT false,
    "error_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gas_operations_pkey" PRIMARY KEY ("operation_id")
);

CREATE INDEX "gas_operations_wallet_updated_idx"
ON "gas_operations" ("wallet_address", "updated_at" DESC);
