import type { Server as HttpServer } from "node:http";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { indexerConfig } from "./config.js";
import { eventStore } from "./db.js";
import { TalambagIndexer } from "./indexer.js";
import { parseEventListFilters, parseEventStreamFilters } from "./request-schemas.js";
import type { ContractEventFilters } from "./types.js";
import type { NormalizedContractEvent } from "./types.js";

const app = express();
const indexer = new TalambagIndexer({ eventStore });

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
    if (error instanceof ZodError) {
      response.status(400).json({
        error: "Invalid request parameters.",
        details: error.flatten().fieldErrors,
      });
      return;
    }

    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected indexer error.",
    });
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
      if (!server) {
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
  await indexer.start();
  registerShutdownHandlers();

  server = app.listen(indexerConfig.PORT, () => {
    console.log(`Talambag indexer listening on port ${indexerConfig.PORT}`);
  });
}

void main().catch(async (error) => {
  console.error("Failed to start the Talambag indexer.", error);
  await eventStore.disconnect().catch(() => undefined);
  process.exitCode = 1;
});