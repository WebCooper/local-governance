"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { ReportingABI } from "@/lib/contracts/abis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  RotateCw,
  AlertCircle,
} from "lucide-react";
import { IssueCard, type Issue } from "@/components/IssueCard";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

// ── Status map (mirrors Reporting.sol enum) ──────────────────────────────────
const STATUS_LABELS: Record<number, string> = {
  0: "Pending Validation",
  1: "Community Rejected",
  2: "Open",
  3: "In Progress",
  4: "Pending Rejection Review",
  5: "Pending Verification",
  6: "Closed / Solved",
  7: "Reopened",
};

const STATUS_BADGE_VARIANT: Record<number, string> = {
  0: "warning",
  1: "destructive",
  2: "secondary",
  3: "default",
  4: "warning",
  5: "secondary",
  6: "success",
  7: "outline",
};

const STATUS_FILTER_OPTIONS = [
  { label: "All Statuses", value: "all" },
  { label: "Pending Validation", value: "0" },
  { label: "Open", value: "2" },
  { label: "In Progress", value: "3" },
  { label: "Pending Rejection Review", value: "4" },
  { label: "Pending Verification", value: "5" },
  { label: "Closed / Solved", value: "6" },
  { label: "Community Rejected", value: "1" },
  { label: "Reopened", value: "7" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractCid(raw: string): string | null {
  if (!raw || raw === "ipfs://none") return null;
  const first = raw.split(",")[0].trim();
  return first.startsWith("ipfs://") ? first.slice(7) : first;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function IssuesExplorer() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        if (!CONTRACT_ADDRESS) throw new Error("Contract address not configured.");

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ReportingABI, provider);

        // Fetch up to 100 most-recent reports
        const [page] = await contract.getAllReports(0, 100);

        const base: Issue[] = (page as any[]).map((r) => ({
          id: Number(r.id),
          ipfsCid: r.ipfsCid as string,
          status: Number(r.status),
          createdAt: Number(r.createdAt) * 1000,
          votes: {
            validationUpvotes: Number(r.votes.validationUpvotes),
            validationDownvotes: Number(r.votes.validationDownvotes),
            verificationAcceptVotes: Number(r.votes.verificationAcceptVotes),
            verificationRejectVotes: Number(r.votes.verificationRejectVotes),
            rejectionUpholdVotes: Number(r.votes.rejectionUpholdVotes),
            rejectionAppealVotes: Number(r.votes.rejectionAppealVotes),
          },
        }));

        if (!cancelled) setIssues(base);

        // Enrich with IPFS metadata in parallel
        base.forEach(async (item) => {
          const cid = extractCid(item.ipfsCid);
          if (!cid) return;
          try {
            const res = await fetch(`/api/ipfs/${cid}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!data.success) return;
            if (!cancelled) {
              setIssues((prev) =>
                prev.map((p) =>
                  p.id === item.id
                    ? {
                        ...p,
                        description: data.description,
                        category: data.category,
                        location: data.location,
                      }
                    : p
                )
              );
            }
          } catch {}
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load reports.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredIssues = issues.filter((issue) => {
    const matchesStatus =
      statusFilter === "all" || issue.status === parseInt(statusFilter);
    const matchesSearch =
      !search ||
      (issue.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (issue.category ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (issue.location ?? "").toLowerCase().includes(search.toLowerCase()) ||
      String(issue.id).includes(search);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="container mx-auto py-12 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Community Explorer</h1>
          <p className="text-muted-foreground">
            Browse and track the progress of local issues reported by the community.
          </p>
        </div>
        <Link href="/report">
          <Button className="shadow-lg">Submit New Report</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8 bg-card p-4 rounded-xl shadow-sm border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by description, category, location or ID…"
            className="pl-9 bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-4">
            <RotateCw className="w-10 h-10 animate-spin text-primary/60" />
            <p className="text-muted-foreground">Fetching ledger records…</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-muted-foreground text-center max-w-sm">{error}</p>
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border">
          <p className="text-muted-foreground">No issues found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIssues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>

      )}
    </div>
  );
}
