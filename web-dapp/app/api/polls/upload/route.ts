import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const ipfsUrl = `${process.env.NEXT_PUBLIC_IPFS_URL || "http://localhost:4000"}/api/ipfs/poll/store`;
    
    const response = await fetch(ipfsUrl, {
      method: "POST",
      body: formData,
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: any) {
    console.error("IPFS poll upload proxy failed:", err);
    return NextResponse.json(
      { success: false, error: err.message || "IPFS proxy failure" },
      { status: 500 }
    );
  }
}
