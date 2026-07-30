import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const PUBLIC_REPORTING_ABI = [
  {
    "type": "function",
    "name": "getAllReports",
    "inputs": [
      { "name": "offset", "type": "uint256" },
      { "name": "limit", "type": "uint256" }
    ],
    "outputs": [
      {
        "name": "page",
        "type": "tuple[]",
        "components": [
          { "name": "id", "type": "uint256" },
          { "name": "ipfsCid", "type": "string" },
          { "name": "reportHash", "type": "bytes32" },
          { "name": "submissionNullifier", "type": "bytes32" },
          { "name": "citizenPseudonym", "type": "bytes32" },
          { "name": "submittedByRelayer", "type": "address" },
          { "name": "status", "type": "uint8" },
          { "name": "createdAt", "type": "uint256" },
          { "name": "updatedAt", "type": "uint256" },
          { "name": "phaseDeadline", "type": "uint256" },
          { "name": "assignedAuthority", "type": "address" }
        ]
      },
      { "name": "total", "type": "uint256" }
    ],
    "stateMutability": "view"
  }
];

const IPFS_BASE_URL =
  process.env.NEXT_PUBLIC_IPFS_URL || "http://51.210.111.188:4000";

interface CachedReportMeta {
  id: string;
  category: string;
  description: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  status?: number;
  createdAt?: number;
  imageUrl?: string;
}

// Immutable CID -> Metadata cache in server memory
const ipfsMetaCache = new Map<string, CachedReportMeta>();

// Short TTL cache for blockchain report list (10 seconds)
let reportsListCache: any[] | null = null;
let reportsListCacheTime = 0;

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRadians = (deg: number) => deg * (Math.PI / 180);

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, lat, lng } = body;

    if (typeof lat !== "number" || typeof lng !== "number" || !category) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters (category, lat, lng)" },
        { status: 400 }
      );
    }

    const providerUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

    if (!contractAddress) {
      return NextResponse.json(
        { success: false, error: "Contract address not configured" },
        { status: 500 }
      );
    }

    // 1. Fetch recent reports from blockchain (with 10s TTL cache)
    const now = Date.now();
    let reportsArray: any[] = [];

    if (reportsListCache && now - reportsListCacheTime < 10000) {
      reportsArray = reportsListCache;
    } else {
      const provider = new ethers.JsonRpcProvider(providerUrl);
      const contract = new ethers.Contract(contractAddress, PUBLIC_REPORTING_ABI, provider);
      const [fetched] = await contract.getAllReports(0, 30);
      reportsArray = fetched;
      reportsListCache = fetched;
      reportsListCacheTime = now;
    }

    // 2. Resolve metadata for recent reports
    const activeReports: CachedReportMeta[] = [];

    for (const rep of reportsArray) {
      const id = rep.id.toString();
      const rawCid = rep.ipfsCid || "";
      const cid = rawCid.split(",")[0].trim().replace(/^ipfs:\/\//, "");

      if (!cid || cid === "none") continue;

      if (ipfsMetaCache.has(cid)) {
        activeReports.push(ipfsMetaCache.get(cid)!);
        continue;
      }

      try {
        const res = await fetch(`${IPFS_BASE_URL}/api/ipfs/complaint/${cid}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) continue;
        const data = await res.json();
        if (!data.success && !data.category) continue;

        let parsedLat = 0;
        let parsedLng = 0;
        let address = "";

        if (data.location) {
          if (typeof data.location === "object") {
            parsedLat = Number(data.location.lat || 0);
            parsedLng = Number(data.location.lng || 0);
            address = data.location.address || "";
          } else if (typeof data.location === "string") {
            try {
              const locObj = JSON.parse(data.location);
              parsedLat = Number(locObj.lat || 0);
              parsedLng = Number(locObj.lng || 0);
              address = locObj.address || "";
            } catch {}
          }
        }

        const firstImg = data.images?.[0];
        const imageUrl = firstImg?.data
          ? `data:${firstImg.mimeType || "image/jpeg"};base64,${firstImg.data}`
          : undefined;

        const meta: CachedReportMeta = {
          id,
          category: data.category || "Other",
          description: data.description || "",
          location: { lat: parsedLat, lng: parsedLng, address },
          status: Number(rep.status || 0),
          createdAt: Number(rep.createdAt || 0) * 1000,
          imageUrl,
        };

        ipfsMetaCache.set(cid, meta);
        activeReports.push(meta);
      } catch (err) {
        // Silently skip if IPFS fetch times out for an old CID
      }
    }

    // 3. Filter by Category AND Geofence (1000 meters = 1km)
    const duplicates = activeReports.filter((rep) => {
      // Must be same category (case-insensitive check)
      const sameCategory =
        rep.category.trim().toLowerCase() === category.trim().toLowerCase();

      if (!sameCategory) return false;

      // Calculate distance
      const distance = calculateDistance(lat, lng, rep.location.lat, rep.location.lng);

      console.log(
        `[Duplicate Check] Report #${rep.id} (${rep.category}): distance=${Math.round(distance)}m (threshold=1000m)`
      );

      return distance <= 1000;
    });

    console.log(
      `[Duplicate Check] Input (${category} @ ${lat.toFixed(4)}, ${lng.toFixed(4)}) -> Found ${duplicates.length} duplicate(s)`
    );

    return NextResponse.json({ success: true, duplicates });
  } catch (error: any) {
    console.error("[Duplicate Check Error]:", error.message);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to check duplicates" },
      { status: 500 }
    );
  }
}
