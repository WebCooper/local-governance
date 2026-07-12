import { NextRequest, NextResponse } from "next/server";

const IPFS_BASE_URL = process.env.NEXT_PUBLIC_IPFS_URL || "http://51.210.111.188:4000";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cid: string }> }
) {
  const { cid } = await params;

  if (!cid) {
    return NextResponse.json({ success: false, error: "Missing CID" }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${IPFS_BASE_URL}/api/ipfs/text/${cid}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      }
    );

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: any) {
    console.error(`[IPFS Text Proxy] Failed for CID ${cid}:`, err.message);
    return NextResponse.json(
      { success: false, error: err.message ?? "Proxy request failed" },
      { status: 502 }
    );
  }
}
