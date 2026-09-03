import { NextRequest, NextResponse } from "next/server";

const IPFS_BASE_URL = process.env.NEXT_PUBLIC_IPFS_URL || "http://51.210.111.188:4000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const textContent = body.content || body.text || "";

    const ipfsUrl = `${IPFS_BASE_URL}/api/ipfs/text/store`;

    const response = await fetch(ipfsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: textContent,
        title: body.title || "Authority Comment",
        encoding: "utf-8",
      }),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "IPFS proxy failure";
    console.error("IPFS text upload proxy failed:", err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
