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
      `${IPFS_BASE_URL}/api/ipfs/image/${cid}`,
      {
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: `Upstream error: ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error(`[IPFS Image Proxy] Failed for CID ${cid}:`, err.message);
    return NextResponse.json(
      { success: false, error: err.message ?? "Proxy request failed" },
      { status: 502 }
    );
  }
}
