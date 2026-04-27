import cors from "cors";
import express from "express";
import { indexerConfig } from "./config.js";
import { ensureDatabase, getDatabaseHealth, listEvents } from "./db.js";
import { TalambagIndexer } from "./indexer.js";
import type { NormalizedContractEvent } from "./types.js";

const app = express();
const indexer = new TalambagIndexer();

type StreamClient = {
  filters: {
    groupId?: number;
    poolId?: number;
  };
  response: express.Response;
};

const streamClients = new Set<StreamClient>();

function matchesFilters(
  event: NormalizedContractEvent,
  filters: { groupId?: number; poolId?: number },
) {
  if (filters.groupId !== undefined && event.groupId !== filters.groupId) {
    return false;
  }

  if (filters.poolId !== undefined && event.poolId !== filters.poolId) {
    return false;
  }

  return true;
}

indexer.onEvent((event) => {
  for (const client of streamClients) {
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
    databaseTime: await getDatabaseHealth(),
    contracts: {
      core: indexerConfig.INDEXER_CORE_CONTRACT_ID,
      rewards: indexerConfig.INDEXER_REWARD_CONTRACT_ID,
    },
    indexer: indexer.getStatus(),
  });
});

app.get("/events", async (request, response, next) => {
  try {
    const groupId =
      typeof request.query.groupId === "string" ? Number(request.query.groupId) : undefined;
    const poolId =
      typeof request.query.poolId === "string" ? Number(request.query.poolId) : undefined;
    const limit = typeof request.query.limit === "string" ? Number(request.query.limit) : undefined;

    const events = await listEvents({
      groupId: Number.isFinite(groupId) ? groupId : undefined,
      poolId: Number.isFinite(poolId) ? poolId : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    response.json({ events });
  } catch (error) {
    next(error);
  }
});

app.get("/events/stream", (request, response) => {
  const groupId =
    typeof request.query.groupId === "string" ? Number(request.query.groupId) : undefined;
  const poolId =
    typeof request.query.poolId === "string" ? Number(request.query.poolId) : undefined;

  response.writeHead(200, {
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "content-type": "text/event-stream",
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const client: StreamClient = {
    filters: {
      groupId: Number.isFinite(groupId) ? groupId : undefined,
      poolId: Number.isFinite(poolId) ? poolId : undefined,
    },
    response,
  };

  streamClients.add(client);

  const keepAlive = setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 15_000);

  request.on("close", () => {
    clearInterval(keepAlive);
    streamClients.delete(client);
    response.end();
  });
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected indexer error.",
    });
  },
);

async function main() {
  await ensureDatabase();
  await indexer.start();

  app.listen(indexerConfig.PORT, () => {
    console.log(`Talambag indexer listening on port ${indexerConfig.PORT}`);
  });
}

void main();