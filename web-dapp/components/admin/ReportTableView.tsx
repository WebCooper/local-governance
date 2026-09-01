"use client";

import React from "react";
import {
  FileText,
  MapPin,
  ThumbsUp,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  AlertCircle,
  Copy,
  Tag,
} from "lucide-react";
import type { EnrichedReport } from "@/lib/reportHelpers";
import { STATUS_MAP, REPORT_STATUS, getStatusMeta } from "@/lib/reportHelpers";

interface ReportTableViewProps {
  reports: EnrichedReport[];
  onStartWork: (id: number) => void;
  onResolve: (id: number) => void;
  onReject: (id: number) => void;
  onViewDetails: (report: EnrichedReport) => void;
}

export const ReportTableView: React.FC<ReportTableViewProps> = ({
  reports,
  onStartWork,
  onResolve,
  onReject,
  onViewDetails,
}) => {
  const exportToCSV = () => {
    if (!reports || reports.length === 0) return;

    const headers = [
      "ID",
      "Category",
      "Title",
      "Location",
      "Status",
      "Upvotes",
      "IPFS_CID",
      "Submitted_Timestamp",
    ];

    const rows = reports.map((r) => [
      r.id.toString(),
      `"${(r.category || "").replace(/"/g, '""')}"`,
      `"${(r.title || "").replace(/"/g, '""')}"`,
      `"${(r.location || "").replace(/"/g, '""')}"`,
      STATUS_MAP[r.status]?.label || "Unknown",
      (r.votes?.validationUpvotes || 0).toString(),
      r.ipfsCid || "",
      new Date(r.createdAt * 1000).toISOString(),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `aurachain_reports_export_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Table Top Action Bar */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Triage Queue
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-xs font-bold">
            {reports.length}
          </span>
        </div>
        <button
          onClick={exportToCSV}
          disabled={reports.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-semibold shadow-sm transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="w-3.5 h-3.5 text-blue-600" />
          <span>Export CSV</span>
        </button>
      </div>

      {reports.length === 0 ? (
        <div className="py-16 text-center">
          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">
            No reports match the selected filters or search query
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Try adjusting your category, status, or search keywords.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/60 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-16">ID</th>
                <th className="py-3.5 px-4">Category & Title</th>
                <th className="py-3.5 px-4">Location</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-center">Upvotes</th>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4 text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {reports.map((report) => {
                const statusMeta =
                  getStatusMeta(report.status) || STATUS_MAP[0];
                const isOpen =
                  report.status === REPORT_STATUS.Open ||
                  report.status === REPORT_STATUS.Reopened;
                const isInProgress =
                  report.status === REPORT_STATUS.InProgress;

                return (
                  <tr
                    key={report.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* ID */}
                    <td className="py-4 px-4 font-bold text-slate-900">
                      #{report.id}
                    </td>

                    {/* Category & Title */}
                    <td
                      className="py-4 px-4 max-w-xs cursor-pointer"
                      onClick={() => onViewDetails(report)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {report.category && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold text-xs inline-flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {report.category}
                          </span>
                        )}
                        {report.potentialDuplicates &&
                          report.potentialDuplicates.length > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold text-xs inline-flex items-center gap-1">
                              <Copy className="w-3 h-3" />
                              {report.potentialDuplicates.length} Dup(s)
                            </span>
                          )}
                      </div>
                      <p className="font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {report.title || "Untitled Civic Issue"}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {report.description || "No description provided."}
                      </p>
                    </td>

                    {/* Location */}
                    <td className="py-4 px-4 text-slate-600 max-w-[180px]">
                      <div className="flex items-center gap-1.5 text-xs font-medium truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {report.location || "Not specified"}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusMeta.text} ${statusMeta.bg}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {statusMeta.label}
                      </span>
                    </td>

                    {/* Upvotes */}
                    <td className="py-4 px-4 text-center font-bold text-slate-700">
                      <span className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-xs">
                        <ThumbsUp className="w-3.5 h-3.5 text-blue-600" />
                        {report.votes?.validationUpvotes || 0}
                      </span>
                    </td>

                    {/* Timestamp */}
                    <td className="py-4 px-4 text-xs font-medium text-slate-500 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {new Date(
                            report.createdAt * 1000
                          ).toLocaleDateString()}{" "}
                          {new Date(
                            report.createdAt * 1000
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </td>

                    {/* Quick Actions */}
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {isOpen && (
                          <button
                            onClick={() => onStartWork(report.id)}
                            title="Start Work on this report"
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {isInProgress && (
                          <button
                            onClick={() => onResolve(report.id)}
                            title="Mark Solved"
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {(isOpen || isInProgress) && (
                          <button
                            onClick={() => onReject(report.id)}
                            title="Reject Report"
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => onViewDetails(report)}
                          title="View full report details"
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
