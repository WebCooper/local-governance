"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCw, FileText, AlertCircle } from "lucide-react";

// 1. Minimal ABI matching getAllReports in Reporting.sol
const PUBLIC_REPORTING_ABI = [
  "function getAllReports(uint256 offset, uint256 limit) view returns (tuple(uint256 id, string ipfsCid, bytes32 reportHash, bytes32 submissionNullifier, bytes32 citizenPseudonym, address submittedByRelayer, uint8 status, uint256 createdAt, uint256 updatedAt, uint256 phaseDeadline, address assignedAuthority, tuple(uint256 validationUpvotes, uint256 validationDownvotes, uint256 verificationAcceptVotes, uint256 verificationRejectVotes, uint256 rejectionUpholdVotes, uint256 rejectionAppealVotes) votes)[] page, uint256 total)"
];

export interface PublicReport {
  id: string;
  ipfsCid: string;
  status: number;
  createdAt: number;
  upvotes: number;
  downvotes: number;
}

export default function AllReportsFeedPage() {
  const [reports, setReports] = useState<PublicReport[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [offset, setOffset] = useState(0);
  const LIMIT = 20; // Fetch 20 items at a time (contract allows up to 100)

  const fetchPublicReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

      if (!CONTRACT_ADDRESS) {
        throw new Error("Smart contract address is not configured.");
      }

      // Read-only provider (no signer required for public view functions)
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, PUBLIC_REPORTING_ABI, provider);

      // Call getAllReports directly from the blockchain
      const [pageArray, totalReports] = await contract.getAllReports(offset, LIMIT);

      const formattedReports: PublicReport[] = pageArray.map((r: any) => ({
        id: r.id.toString(),
        ipfsCid: r.ipfsCid,
        status: Number(r.status),
        createdAt: Number(r.createdAt) * 1000, // Convert EVM timestamp to milliseconds
        upvotes: Number(r.votes.validationUpvotes),
        downvotes: Number(r.votes.validationDownvotes),
      }));

      setTotalCount(Number(totalReports));
      setReports(formattedReports);
    } catch (err: any) {
      console.error("Error fetching all reports:", err);
      setError(err.message || "Failed to load reports from the blockchain.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicReports();
  }, [offset]);

  // Status mappings aligned perfectly with the ReportStatus enum indices in Reporting.sol
  const getStatusBadge = (status: number) => {
    switch (status) {
      case 0: return <Badge variant="outline">Pending Validation</Badge>;
      case 1: return <Badge variant="destructive">Rejected by Community</Badge>;
      case 2: return <Badge variant="secondary">Open</Badge>;
      case 3: return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">In Progress</Badge>;
      case 4: return <Badge variant="outline">Rejection Under Review</Badge>;
      case 5: return <Badge variant="secondary">Pending Verification</Badge>;
      case 6: return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Closed / Solved</Badge>;
      case 7: return <Badge variant="outline">Reopened</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-4xl space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Public Civic Feed</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Displaying {reports.length} of {totalCount} total reports registered on AuraChain
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchPublicReports} disabled={loading}>
          <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && reports.length === 0 ? (
        <div className="py-24 text-center">
          <RotateCw className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground text-sm font-medium">Syncing public ledger state...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm">Error Loading Feed</h4>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed shadow-sm">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <p className="text-lg font-medium text-foreground">No reports recorded yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <Card key={report.id} className="border shadow-sm bg-card">
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                    Report #{report.id}
                  </span>
                  <CardTitle className="text-sm font-mono text-muted-foreground truncate max-w-xs mt-2">
                    IPFS: {report.ipfsCid}
                  </CardTitle>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {getStatusBadge(report.status)}
                  <span className="text-xs text-muted-foreground mt-1">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex justify-between items-center pt-2 border-t text-xs text-muted-foreground bg-muted/20 rounded-b-lg p-4 mt-2">
                <span>Validation Upvotes: <strong className="text-green-600 font-bold">{report.upvotes}</strong></span>
                <span>Validation Downvotes: <strong className="text-red-600 font-bold">{report.downvotes}</strong></span>
              </CardContent>
            </Card>
          ))}

          {/* Simple Pagination Controls */}
          {totalCount > LIMIT && (
            <div className="flex justify-center items-center gap-4 pt-4">
              <Button 
                variant="outline" 
                disabled={offset === 0 || loading}
                onClick={() => setOffset((prev) => Math.max(0, prev - LIMIT))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground font-medium">
                Showing {offset + 1} - {Math.min(offset + LIMIT, totalCount)}
              </span>
              <Button 
                variant="outline" 
                disabled={offset + LIMIT >= totalCount || loading}
                onClick={() => setOffset((prev) => prev + LIMIT)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}