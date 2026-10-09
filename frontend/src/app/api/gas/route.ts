import { NextRequest, NextResponse } from "next/server";
import {
  GasHttpError,
  getGasServerConfig,
  isSameOriginRequest,
  isValidOperationId,
  parseGasRequestBody,
  postToIndexer,
  readBoundedJson,
  readGasSession,
  safeGasResult,
  safeIndexerError,
} from "@/lib/server/gas-session";

export const runtime = "nodejs";
export const maxDuration = 20;

function jsonError(error: unknown) {
  const status = error instanceof GasHttpError ? error.statusCode : 503;
  const message = error instanceof GasHttpError ? error.message : "Gas Station is unavailable.";
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new GasHttpError("Same-origin request required.", 403);
    }

    getGasServerConfig();
    const walletAddress = readGasSession(request);
    if (!walletAddress) throw new GasHttpError("Connect and authorize the wallet before submitting.", 401);

    const body = parseGasRequestBody(await readBoundedJson(request));
    const upstream = await postToIndexer(
      "/internal/gas/submit",
      { ...body, walletAddress },
      11_000,
    );
    if (!upstream.ok) {
      const safeError = await safeIndexerError(upstream);
      return NextResponse.json(safeError, {
        status: upstream.status,
        headers: { "cache-control": "no-store" },
      });
    }

    const safeResult = safeGasResult(await upstream.json(), body.operationId);
    return NextResponse.json(safeResult, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    getGasServerConfig();
    const walletAddress = readGasSession(request);
    if (!walletAddress) throw new GasHttpError("Authorize the wallet before checking Gas status.", 401);

    const operationId = request.nextUrl.searchParams.get("operationId");
    if (!isValidOperationId(operationId)) {
      throw new GasHttpError("operationId must be a UUID.", 400);
    }
    const observeUntilTerminal = request.nextUrl.searchParams.get("observe") === "1";
    const upstream = await postToIndexer(
      "/internal/gas/status",
      { operationId, walletAddress, observeUntilTerminal },
      8_000,
    );
    if (!upstream.ok) {
      const safeError = await safeIndexerError(upstream);
      return NextResponse.json(safeError, {
        status: upstream.status,
        headers: { "cache-control": "no-store" },
      });
    }

    const safeResult = safeGasResult(await upstream.json(), operationId);
    return NextResponse.json(safeResult, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
