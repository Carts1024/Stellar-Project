import { NextResponse } from "next/server";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_STELLAR_EXPLORER_URL ??
  "https://stellar.expert/explorer/testnet";

const CONTRACT_ID = process.env.NEXT_PUBLIC_TALAMBAG_CONTRACT_ID ?? "";

export async function GET() {
  if (!CONTRACT_ID) {
    return NextResponse.json(
      { error: "Contract not configured on the server." },
      { status: 500 },
    );
  }

  const apiBase = EXPLORER_URL.replace(
    "https://stellar.expert/",
    "https://api.stellar.expert/",
  );
  const url = `${apiBase}/contract/${CONTRACT_ID}/events?limit=200&order=desc`;

  const upstream = await fetch(url, { next: { revalidate: 30 } });

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream returned HTTP ${upstream.status}` },
      { status: upstream.status },
    );
  }

  const data = await upstream.json();
  return NextResponse.json(data);
}
