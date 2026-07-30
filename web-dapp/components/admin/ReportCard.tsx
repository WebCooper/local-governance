"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  Landmark,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
} from "lucide-react";
import { ReportStatusBadge } from "@/components/admin/ReportStatusBadge";
import { ReportActionButtons } from "@/components/admin/ReportActionButtons";
import {
  type EnrichedReport,
  formatLocation,
  shortenAddress,
  REPORT_STATUS,
} from "@/lib/reportHelpers";

interface ReportCardProps {
  report: EnrichedReport;
  currentAccount: string;
  reportingContract: any;
  onActionSuccess: (reportId: number) => void;
}

export function ReportCard({
  report,
  currentAccount,
  reportingContract,
  onActionSuccess,
}: ReportCardProps) {
  const [expanded, setExpanded] = useState(false);

  const createdAt = new Date(report.createdAt * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const isAssigned =
    report.assignedAuthority.toLowerCase() === currentAccount.toLowerCase() &&
    report.assignedAuthority !== "0x0000000000000000000000000000000000000000";

  // Pick vote counts relevant to the current phase
  const voteDisplay = (() => {
    switch (report.status) {
      case REPORT_STATUS.PendingValidation:
        return {
          label: "Validation Votes",
          yes: report.votes.validationUpvotes,
          no: report.votes.validationDownvotes,
        };
      case REPORT_STATUS.PendingVerification:
        return {
          label: "Verification Votes",
          yes: report.votes.verificationAcceptVotes,
          no: report.votes.verificationRejectVotes,
        };
      case REPORT_STATUS.PendingRejectionReview:
        return {
          label: "Review Votes",
          yes: report.votes.rejectionUpholdVotes,
          no: report.votes.rejectionAppealVotes,
        };
      default:
        return null;
    }
  })();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Card Header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left: ID + Category + Status */}
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-bold font-mono text-slate-400">
                #{report.id}
              </span>
              <ReportStatusBadge status={report.status} showDot size="sm" />
              {report.category && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                  {report.category}
                </span>
              )}
              {report.isEmergency && report.status !== REPORT_STATUS.Closed && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-600 text-white shadow-sm flex items-center gap-1 animate-pulse">
                  🚨 EMERGENCY
                </span>
              )}
              {isAssigned && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Assigned to you
                </span>
              )}
            </div>

            {/* Description preview */}
            <p className="text-sm text-slate-700 font-medium leading-snug line-clamp-2">
              {report.description ?? (
                <span className="text-slate-400 italic">
                  {report.ipfsLoaded
                    ? "No description available."
                    : "Loading details…"}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center flex-wrap gap-4 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {createdAt}
          </span>

          {report.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {formatLocation(report.location)}
            </span>
          )}

          <span className="flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono">{shortenAddress(report.assignedAuthority)}</span>
          </span>

          {/* Voting counts for phases awaiting community vote */}
          {voteDisplay && (
            <span className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {voteDisplay.label}:
              </span>
              <span className="flex items-center gap-1 text-green-600 font-bold">
                <ThumbsUp className="w-3 h-3" />
                {voteDisplay.yes}
              </span>
              <span className="flex items-center gap-1 text-red-500 font-bold">
                <ThumbsDown className="w-3 h-3" />
                {voteDisplay.no}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Expanded: Images */}
      {expanded && report.images && report.images.length > 0 && (
        <div className="px-5 pb-4">
          <div className="grid grid-cols-3 gap-2">
            {report.images.slice(0, 3).map((img, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden aspect-video bg-slate-100 border border-slate-100"
              >
                <img
                  src={`data:${img.mimeType || "image/jpeg"};base64,${img.data}`}
                  alt={img.originalName}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: Actions */}
      <div className="px-5 pb-5 flex items-center justify-between gap-3 flex-wrap border-t border-slate-50 pt-4">
        {/* Action Buttons */}
        <ReportActionButtons
          report={report}
          currentAccount={currentAccount}
          reportingContract={reportingContract}
          onActionSuccess={onActionSuccess}
        />

        <div className="flex items-center gap-2 ml-auto">
          {/* Expand / Collapse images */}
          {report.images && report.images.length > 0 && (
            <button
              onClick={() => setExpanded((p) => !p)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide images
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  {report.images.length} image{report.images.length !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}

          {/* View full detail */}
          <Link
            href={`/admin/reports/${report.id}`}
            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-bold transition-colors"
          >
            Full Detail
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
