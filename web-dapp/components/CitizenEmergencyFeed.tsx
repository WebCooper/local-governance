"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  MapPin,
  Search,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { EmergencyReportingABI } from "@/lib/contracts/abis";
import { EMERGENCY_REPORTING_ADDRESS } from "@/context/AdminContext";
import {
  type EnrichedReport,
  rawToEnriched,
  enrichReportWithIPFS,
  getEmergencyStatusMeta,
  shortenAddress,
  formatLocation,
  EMERGENCY_STATUS,
} from "@/lib/reportHelpers";

export function CitizenEmergencyFeed() {
  const [reports, setReports] = useState<EnrichedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "inProgress" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchEmergencyReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
      const contractAddress =
        EMERGENCY_REPORTING_ADDRESS || "0x43491d6850cef4B2E2D0d5CaCdF59B014B4A49ba";

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(
        contractAddress,
        EmergencyReportingABI,
        provider
      );

      const [page, total] = await contract.getAllReports(0, 50);

      const baseReports: EnrichedReport[] = page.map((r: any) =>
        rawToEnriched(r, true)
      );

      const enrichedReports = await Promise.all(
        baseReports.map((r) => enrichReportWithIPFS(r))
      );

      setReports(enrichedReports);
    } catch (err: any) {
      console.error("Failed to load emergency reports:", err);
      setError(err.message || "Could not retrieve emergency reports from the network.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmergencyReports();
  }, []);

  const filteredReports = reports.filter((report) => {
    if (filter === "open" && report.status !== EMERGENCY_STATUS.Open) return false;
    if (filter === "inProgress" && report.status !== EMERGENCY_STATUS.InProgress) return false;
    if (
      filter === "resolved" &&
      report.status !== EMERGENCY_STATUS.Resolved &&
      report.status !== EMERGENCY_STATUS.Reclassified
    )
      return false;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchTitle = (report.title || "").toLowerCase().includes(query);
      const matchDesc = (report.description || "").toLowerCase().includes(query);
      const matchCategory = (report.category || "").toLowerCase().includes(query);
      const matchLocation = (report.location || "").toLowerCase().includes(query);
      const matchId = report.id.toString().includes(query);
      return matchTitle || matchDesc || matchCategory || matchLocation || matchId;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filter === "all"
                ? "bg-red-600 text-white shadow-sm"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100"
            }`}
          >
            All Emergencies ({reports.length})
          </button>
          <button
            onClick={() => setFilter("open")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filter === "open"
                ? "bg-red-600 text-white shadow-sm"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            Open Alerts
          </button>
          <button
            onClick={() => setFilter("inProgress")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filter === "inProgress"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setFilter("resolved")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filter === "resolved"
                ? "bg-green-600 text-white shadow-sm"
                : "bg-green-50 text-green-700 hover:bg-green-100"
            }`}
          >
            Resolved
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search emergencies by ID, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm gap-3">
          <RotateCw className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-xs font-semibold text-slate-500">
            Syncing emergency alerts from AuraChain...
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 bg-red-50/50 rounded-2xl border border-red-200 text-center p-6 gap-3">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <h3 className="text-sm font-bold text-red-900">Failed to Load Alerts</h3>
          <p className="text-xs text-red-600 max-w-md">{error}</p>
          <button
            onClick={fetchEmergencyReports}
            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            Retry Sync
          </button>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center p-6 gap-3">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Emergency Alerts Found</h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {searchQuery || filter !== "all"
              ? "No emergency reports matched your selected filter criteria."
              : "There are currently no emergency reports registered on-chain."}
          </p>
          {(searchQuery || filter !== "all") && (
            <button
              onClick={() => {
                setFilter("all");
                setSearchQuery("");
              }}
              className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredReports.map((report) => {
            const statusMeta = getEmergencyStatusMeta(report.status);
            const isAssigned =
              report.assignedAuthority &&
              report.assignedAuthority !== "0x0000000000000000000000000000000000000000";

            const thumbImage =
              report.images && report.images.length > 0 && report.images[0].data
                ? `data:${report.images[0].mimeType || "image/jpeg"};base64,${report.images[0].data}`
                : null;

            return (
              <div
                key={report.id}
                className="bg-white rounded-2xl border border-red-200/80 shadow-sm hover:shadow-md transition-all duration-200 p-6 flex flex-col justify-between relative overflow-hidden group"
              >
                {/* Priority Indicator Strip */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-rose-500 to-amber-500" />

                {/* Card Header */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                        EMERGENCY #{report.id}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                        {statusMeta.label}
                      </span>
                    </div>

                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1 shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(report.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-red-600 transition-colors mb-2 line-clamp-1">
                    {report.title || `Emergency Alert #${report.id}`}
                  </h3>

                  {/* Category & Location */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {report.category && (
                      <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700">
                        {report.category}
                      </span>
                    )}
                    {report.location && (
                      <span className="text-xs text-slate-500 flex items-center gap-1 truncate max-w-[220px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {formatLocation(report.location)}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-4">
                    {report.description ||
                      "High-priority citizen emergency report awaiting rapid authority dispatch and on-site investigation."}
                  </p>

                  {/* Thumbnail Preview if attached */}
                  {thumbImage && (
                    <div className="mb-4 rounded-xl overflow-hidden border border-slate-200/80 aspect-video max-h-40 bg-slate-100">
                      <img
                        src={thumbImage}
                        alt="Emergency Evidence"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>

                {/* Footer / Assigned Authority & CTA */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 mt-auto">
                  <div className="flex items-center gap-2">
                    {isAssigned ? (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span>Authority: {shortenAddress(report.assignedAuthority)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span>Awaiting Authority Dispatch</span>
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/emergency/${report.id}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-sm transition-all shrink-0"
                  >
                    <span>View Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
