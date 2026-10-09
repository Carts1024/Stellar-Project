import type { Server as HttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { indexerConfig } from "./config.js";
import { eventStore } from "./db.js";
import { TalambagIndexer } from "./indexer.js";
import { parseEventListFilters, parseEventStreamFilters } from "./request-schemas.js";
import type { ContractEventFilters } from "./types.js";
import type { NormalizedContractEvent } from "./types.js";
import { GasRequestError } from "./gas/transaction.js";
import { GasStationService } from "./gas/service.js";
import { PrismaGasOperationStore } from "./gas/store.js";

const app = express();
const indexer = new TalambagIndexer({ eventStore });
const gasService = new GasStationService(
  new PrismaGasOperationStore(),
  undefined,
  [indexerConfig.INDEXER_CORE_CONTRACT_ID, indexerConfig.INDEXER_REWARD_CONTRACT_ID],
);

type StreamFilters = Readonly<Pick<ContractEventFilters, "eventTypes" | "groupId" | "poolId">>;

type StreamClient = {
  filters: StreamFilters;
  keepAliveTimer: NodeJS.Timeout;
  response: express.Response;
};

const streamClients = new Set<StreamClient>();
let server: HttpServer | null = null;
let isShuttingDown = false;

function matchesFilters(event: NormalizedContractEvent, filters: StreamFilters) {
  if (filters.eventTypes && !filters.eventTypes.includes(event.eventType)) {
    return false;
  }

  if (filters.groupId !== undefined && event.groupId !== filters.groupId) {
    return false;
  }

  if (filters.poolId !== undefined && event.poolId !== filters.poolId) {
    return false;
  }

  return true;
}

function closeStreamClient(client: StreamClient) {
  clearInterval(client.keepAliveTimer);
  streamClients.delete(client);

  if (!client.response.writableEnded) {
    client.response.end();
  }
}

function closeAllStreamClients() {
  for (const client of Array.from(streamClients)) {
    closeStreamClient(client);
  }
}

indexer.onEvent((event) => {
  for (const client of streamClients) {
    if (client.response.writableEnded) {
      closeStreamClient(client);
      continue;
    }

    if (!matchesFilters(event, client.filters)) {
      continue;
    }

    client.response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
});

app.use(
  cors({
    origin: indexerConfig.INDEXER_ALLOWED_ORIGIN,
  }),
);

function requireInternalGasToken(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction,
) {
  const expectedToken = indexerConfig.INDEXER_GAS_INTERNAL_TOKEN;
  const authorization = request.get("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!indexerConfig.INDEXER_VELO_GAS_ENABLED || !expectedToken) {
    response.status(503).json({ error: "Gas Station is not enabled on this server." });
    return;
  }

  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    response.status(401).json({ error: "Unauthorized." });
    return;
  }

  next();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

app.post(
  "/internal/gas/auth",
  express.json({ limit: "70kb", strict: true }),
  requireInternalGasToken,
  (request, response, next) => {
    try {
      if (
        !isRecord(request.body) ||
        !hasOnlyKeys(request.body, ["operationId", "signedTransactionXdr"]) ||
        typeof request.body.operationId !== "string" ||
        typeof request.body.signedTransactionXdr !== "string"
      ) {
        response.status(400).json({ error: "Invalid Gas authorization request." });
        return;
      }

      const authorization = gasService.authorize(
        request.body.operationId,
        request.body.signedTransactionXdr,
      );
      response.json(authorization);
    } catch (error) {
      if (!(error instanceof GasRequestError)) {
        console.error("Gas authorization endpoint failed unexpectedly.", error);
      }
      next(error);
    }
  },
);

app.post(
  "/internal/gas/submit",
  express.json({ limit: "70kb", strict: true }),
  requireInternalGasToken,
  async (request, response, next) => {
    try {
      if (
        !isRecord(request.body) ||
        !hasOnlyKeys(request.body, ["operationId", "signedTransactionXdr", "walletAddress"]) ||
        typeof request.body.operationId !== "string" ||
        typeof request.body.signedTransactionXdr !== "string" ||
        typeof request.body.walletAddress !== "string"
      ) {
        response.status(400).json({ error: "Invalid Gas submission request." });
        return;
      }

      const result = await gasService.sponsorAndSubmit(
        request.body.operationId,
        request.body.signedTransactionXdr,
        request.body.walletAddress,
      );
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

app.post(
  "/internal/gas/status",
  express.json({ limit: "4kb", strict: true }),
  requireInternalGasToken,
  async (request, response, next) => {
    try {
      if (
        !isRecord(request.body) ||
        !hasOnlyKeys(request.body, ["operationId", "walletAddress", "observeUntilTerminal"]) ||
        typeof request.body.operationId !== "string" ||
        typeof request.body.walletAddress !== "string" ||
        (request.body.observeUntilTerminal !== undefined &&
          typeof request.body.observeUntilTerminal !== "boolean")
      ) {
        response.status(400).json({ error: "Invalid Gas status request." });
        return;
      }

      const result = await gasService.getStatus(
        request.body.operationId,
        request.body.walletAddress,
        request.body.observeUntilTerminal === true,
      );
      response.json(result);
    } catch (error) {
      next(error);
    }
  },
);

app.get("/health", async (_request, response) => {
  response.json({
    ok: true,
    databaseTime: await eventStore.getDatabaseHealth(),
    contracts: {
      core: indexerConfig.INDEXER_CORE_CONTRACT_ID,
      rewards: indexerConfig.INDEXER_REWARD_CONTRACT_ID,
    },
    indexer: indexer.getStatus(),
  });
});

app.get("/events", async (request, response, next) => {
  try {
    const filters = parseEventListFilters(request.query);
    const events = await eventStore.listEvents(filters);

    response.json({ events });
  } catch (error) {
    next(error);
  }
});

app.get("/events/stream", (request, response, next) => {
  try {
    const filters = parseEventStreamFilters(request.query);

    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
    });
    response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const keepAliveTimer = setInterval(() => {
      if (!response.writableEnded) {
        response.write(": keep-alive\n\n");
      }
    }, 15_000);

    const client: StreamClient = {
      filters,
      keepAliveTimer,
      response,
    };

    streamClients.add(client);

    request.on("close", () => {
      closeStreamClient(client);
    });
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof GasRequestError) {
      response.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }

    if (error instanceof ZodError) {
      response.status(400).json({
        error: "Invalid request parameters.",
        details: error.flatten().fieldErrors,
      });
      return;
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;
    if (statusCode === 413) {
      response.status(413).json({ error: "Request body is too large." });
      return;
    }
    if (statusCode === 400) {
      response.status(400).json({ error: "Invalid request body." });
      return;
    }

    response.status(500).json({ error: "Unexpected indexer error." });
  },
);

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}, shutting down indexer.`);

  indexer.stop();
  closeAllStreamClients();

  try {
    await new Promise<void>((resolve, reject) => {
      if (!server?.listening) {
        resolve();
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  } finally {
    await eventStore.disconnect();
  }
}

function registerShutdownHandlers() {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal).catch((error) => {
        console.error("Failed to shut down the indexer cleanly.", error);
        process.exitCode = 1;
      });
    });
  }
}

async function main() {
  await eventStore.connect();
  registerShutdownHandlers();

  server = app.listen(indexerConfig.PORT, () => {
    console.log(`Talambag indexer listening on port ${indexerConfig.PORT}`);
  });

  void indexer.start().catch((error) => {
    console.error("Failed to start the Talambag indexer.", error);
  });
}

void main().catch(async (error) => {
  console.error("Failed to start the Talambag indexer.", error);
  await eventStore.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
