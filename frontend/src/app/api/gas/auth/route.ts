import { NextRequest, NextResponse } from "next/server";
import {
  createGasSession,
  GAS_SESSION_COOKIE,
  GasHttpError,
  getGasServerConfig,
  isSameOriginRequest,
  parseGasRequestBody,
  postToIndexer,
  readBoundedJson,
  readIndexerJson,
} from "@/lib/server/gas-session";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginRequest(request)) {
      throw new GasHttpError("Same-origin request required.", 403);
    }

    getGasServerConfig();
    const body = parseGasRequestBody(await readBoundedJson(request));
    const upstream = await postToIndexer("/internal/gas/auth", body, 5_000);
    if (!upstream.ok) {
      const upstreamValue: unknown = await upstream.json().catch(() => null);
      const upstreamBody =
        typeof upstreamValue === "object" && upstreamValue !== null && !Array.isArray(upstreamValue)
          ? (upstreamValue as Record<string, unknown>)
          : null;
      const canRelayUpstreamError = [400, 401, 403, 413, 429, 503].includes(upstream.status);
      const status = canRelayUpstreamError ? upstream.status : 502;
      const message =
        canRelayUpstreamError && typeof upstreamBody?.error === "string"
          ? upstreamBody.error
          : "The Gas Station indexer could not authorize this transaction.";
      const code =
        canRelayUpstreamError &&
        typeof upstreamBody?.code === "string" &&
        /^[a-z0-9_]{1,80}$/i.test(upstreamBody.code)
          ? upstreamBody.code
          : undefined;

      return NextResponse.json(
        {
          error: message,
          ...(code ? { code } : {}),
          ...(process.env.NODE_ENV !== "production" && !canRelayUpstreamError
            ? { upstreamStatus: upstream.status }
            : {}),
        },
        { status, headers: { "cache-control": "no-store" } },
      );
    }

    const value = await readIndexerJson(upstream);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new GasHttpError("The Gas Station service returned an invalid authorization.", 502);
    }
    const authorization = value as Record<string, unknown>;
    if (
      authorization.operationId !== body.operationId ||
      typeof authorization.walletAddress !== "string" ||
      !/^G[A-Z2-7]{55}$/.test(authorization.walletAddress)
    ) {
      throw new GasHttpError("The Gas Station service returned an invalid authorization.", 502);
    }

    const session = createGasSession(authorization.walletAddress);
    const response = NextResponse.json({ authenticated: true }, { headers: { "cache-control": "no-store" } });
    response.cookies.set(GAS_SESSION_COOKIE, session.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/gas",
      maxAge: session.maxAge,
    });
    return response;
  } catch (error) {
    const status = error instanceof GasHttpError ? error.statusCode : 503;
    return NextResponse.json(
      { error: error instanceof GasHttpError ? error.message : "Gas Station is unavailable." },
      { status, headers: { "cache-control": "no-store" } },
    );
  }
}
