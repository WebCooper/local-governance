import { NextRequest, NextResponse } from "next/server";

const IPFS_BASE_URL = process.env.NEXT_PUBLIC_IPFS_URL || "http://51.210.111.188:4000";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Image upload: Forward the multipart/form-data directly
      const formData = await req.formData();
      const ipfsUrl = `${IPFS_BASE_URL}/api/ipfs/image/store`;

      const response = await fetch(ipfsUrl, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    } else {
      // Text/comment upload: Forward json payload to storeText
      const body = await req.json();
      const ipfsUrl = `${IPFS_BASE_URL}/api/ipfs/text/store`;

      const response = await fetch(ipfsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: body.content,
          title: body.title || "Authority Comment",
          encoding: "utf-8",
        }),
      });

      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }
  } catch (err: any) {
    console.error("IPFS upload proxy failed:", err);
    return NextResponse.json(
      { success: false, error: err.message || "IPFS proxy failure" },
      { status: 500 }
    );
  }
}
