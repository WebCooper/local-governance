"use client";

import { useNotifications, ReportNotification } from "@/context/NotificationContext";
import { useCitizen } from "@/context/CitizenContext";
import { ReportJobStatus } from "@/lib/useReportStatus";
import {
  Bell, CheckCircle2, AlertCircle, Clock, Loader2, CheckCheck, Trash2, ArrowLeft, Shield
} from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  pending:                    { label: "Queued",         color: "text-slate-700",  bg: "bg-slate-100",  icon: <Clock className="h-4 w-4" /> },
  ai_moderation_in_progress:  { label: "AI Review",      color: "text-amber-700",  bg: "bg-amber-100",  icon: <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> },
  ai_moderation_passed:       { label: "AI Approved",    color: "text-amber-700",  bg: "bg-amber-100",  icon: <Loader2 className="h-4 w-4 animate-spin text-amber-600" /> },
  ai_moderation_failed:       { label: "AI Rejected",    color: "text-red-700",    bg: "bg-red-100",    icon: <AlertCircle className="h-4 w-4 text-red-600" /> },
  ipfs_uploading:             { label: "Uploading",      color: "text-blue-700",   bg: "bg-blue-100",   icon: <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> },
  ipfs_uploaded:              { label: "Uploaded",       color: "text-blue-700",   bg: "bg-blue-100",   icon: <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> },
  ipfs_failed:                { label: "Upload Failed",  color: "text-red-700",    bg: "bg-red-100",    icon: <AlertCircle className="h-4 w-4 text-red-600" /> },
  blockchain_submitting:      { label: "On-Chain",       color: "text-purple-700", bg: "bg-purple-100", icon: <Loader2 className="h-4 w-4 animate-spin text-purple-600" /> },
  blockchain_submitted:       { label: "On-Chain",       color: "text-purple-700", bg: "bg-purple-100", icon: <Loader2 className="h-4 w-4 animate-spin text-purple-600" /> },
  blockchain_failed:          { label: "Chain Failed",   color: "text-red-700",    bg: "bg-red-100",    icon: <AlertCircle className="h-4 w-4 text-red-600" /> },
  completed:                  { label: "Confirmed",      color: "text-green-700",  bg: "bg-green-100",  icon: <CheckCircle2 className="h-4 w-4 text-green-600" /> },
  failed:                     { label: "Failed",         color: "text-red-700",    bg: "bg-red-100",    icon: <AlertCircle className="h-4 w-4 text-red-600" /> },
};

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PIPELINE_STEPS: ReportJobStatus[] = [
  "ai_moderation_in_progress",
  "ipfs_uploading",
  "blockchain_submitting",
  "completed",
];

function stepIndex(status: string): number {
  const map: Record<string, number> = {
    pending: -1,
    ai_moderation_in_progress: 0,
    ai_moderation_passed: 0,
    ai_moderation_failed: 0,
    ipfs_uploading: 1,
    ipfs_uploaded: 1,
    ipfs_failed: 1,
    blockchain_submitting: 2,
    blockchain_submitted: 2,
    blockchain_failed: 2,
    completed: 3,
    failed: 3,
  };
  return map[status] ?? -1;
}

export default function NotificationsPage() {
  const { wallet } = useCitizen();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useNotifications();

  return (
    <div className="min-h-screen bg-[#F9FAFB] pb-28 md:pb-12">
      {/* ══════════════════════════════════════════════
          MOBILE HEADER
      ══════════════════════════════════════════════ */}
      <div className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/feed"
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-extrabold rounded-full">
                  {unreadCount}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="p-2 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-xl transition-colors"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 md:py-8 flex flex-col">
        {/* ══════════════════════════════════════════════
            DESKTOP HERO BANNER
        ══════════════════════════════════════════════ */}
        <div className="hidden md:flex w-full rounded-[32px] overflow-hidden bg-gradient-to-r from-fuchsia-500 to-pink-600 p-8 md:p-10 text-white relative mb-8 shadow-sm flex-col justify-center">
          <div className="absolute top-0 right-0 p-8 opacity-30 pointer-events-none">
            <svg className="animate-spin-in" width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M100 0L105 85L200 100L105 115L100 200L95 115L0 100L95 85L100 0Z" fill="white" />
            </svg>
          </div>
          
          <div className="relative z-10 max-w-3xl">
            <span className="text-pink-100 font-bold tracking-wider text-xs uppercase mb-3 block">Live Tracking</span>
            <div className="flex items-center gap-4 mb-4">
              <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">Notifications</h1>
              {unreadCount > 0 && (
                <span className="px-3 py-1 bg-white/20 backdrop-blur-md border border-white/30 text-white text-base font-extrabold rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-pink-50 text-base md:text-lg max-w-2xl leading-relaxed">
              Real-time tracking of your citizen report processing pipeline.
            </p>
          </div>
        </div>

        {/* ── Controls (Desktop) ── */}
        <div className="hidden md:flex items-center justify-end gap-3 mb-6">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-white border border-slate-200 text-pink-600 hover:bg-pink-50 rounded-[16px] text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-[16px] text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
            >
              <Trash2 className="h-4 w-4" />
              Clear all
            </button>
          )}
        </div>

        <main className="w-full max-w-4xl mx-auto">
          {!wallet ? (
            <div className="bg-white rounded-[24px] border border-slate-100/60 p-12 text-center shadow-sm">
              <Shield className="h-12 w-12 text-pink-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">Citizen Login Required</h3>
              <p className="text-slate-500 mb-6 max-w-md mx-auto">
                Log in with your GovID to view live report processing updates.
              </p>
              <Link
                href="/auth"
                className="inline-block px-6 py-3 bg-pink-600 text-white font-bold text-sm rounded-xl hover:bg-pink-700 transition-colors shadow-sm"
              >
                Go to Login
              </Link>
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-slate-100/60 p-16 text-center shadow-sm">
              <div className="w-20 h-20 bg-pink-50 text-pink-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Bell className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">No Notifications Yet</h3>
              <p className="text-slate-500 max-w-md mx-auto mb-8">
                When you submit an issue or vote on community reports, pipeline updates will appear here in real-time.
              </p>
              <Link
                href="/report"
                className="inline-block px-6 py-3 bg-pink-600 text-white font-bold text-sm rounded-xl hover:bg-pink-700 transition-colors shadow-sm shadow-pink-600/20"
              >
                Submit a Report
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((n) => {
                const config = STATUS_CONFIG[n.status] ?? STATUS_CONFIG.pending;
                const isFailed = n.status.includes("failed");
                const isDone = n.status === "completed";
                const isVote = n.category === "Vote";
                const current = stepIndex(n.status);

                const displaySteps = isVote ? ["Chain", "Done"] : ["AI", "IPFS", "Chain", "Done"];
                let displayCurrent = current;
                if (isVote) {
                  if (current === 2) displayCurrent = 0;
                  else if (current === 3) displayCurrent = 1;
                  else displayCurrent = -1;
                }

                return (
                  <div
                    key={n.jobId}
                    onClick={() => markAsRead(n.jobId)}
                    className={`bg-white rounded-[24px] border p-6 shadow-sm transition-all cursor-pointer hover:shadow-md ${
                      !n.isRead ? "border-pink-200 ring-4 ring-pink-50 bg-pink-50/10" : "border-slate-100/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${config.bg}`}>
                          {config.icon}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-lg">
                            {n.category || "Civic Report"}
                          </h4>
                          <p className="text-sm text-slate-400 font-medium">
                            {formatTime(n.timestamp)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider ${config.bg} ${config.color}`}
                      >
                        {config.label}
                      </span>
                    </div>

                    {/* Step Indicators */}
                    {!isFailed && (
                      <div className="mb-5">
                        <div className="flex items-center gap-2 mb-2">
                          {displaySteps.map((label, i) => (
                            <div key={label} className="flex items-center gap-2">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                  i < displayCurrent
                                    ? "bg-green-500 text-white"
                                    : i === displayCurrent
                                    ? "bg-pink-600 text-white"
                                    : "bg-slate-100 text-slate-400"
                                }`}
                              >
                                {i < displayCurrent ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                              </div>
                              {i < displaySteps.length - 1 && (
                                <div
                                  className={`h-1 w-8 sm:w-16 rounded-full transition-colors ${
                                    i < displayCurrent ? "bg-green-400" : "bg-slate-100"
                                  }`}
                                />
                              )}
                            </div>
                          ))}
                          <span className="ml-2 text-xs text-slate-500 font-bold uppercase tracking-wider">
                            {displaySteps[Math.max(0, displayCurrent)]}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isDone ? "bg-green-500" : "bg-pink-600"
                            }`}
                            style={{ width: `${n.percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Message */}
                    <p className="text-base text-slate-700 leading-relaxed font-medium mb-3">
                      {n.message}
                    </p>

                    {/* Transaction Hash */}
                    {n.data?.transactionHash && (
                      <div className="p-4 bg-slate-50 rounded-[16px] font-mono text-xs sm:text-sm text-green-700 border border-slate-200 flex items-center justify-between mt-2">
                        <span className="font-bold flex items-center gap-1.5">
                          <Shield className="w-4 h-4" /> Transaction Hash:
                        </span>
                        <span className="truncate max-w-[150px] sm:max-w-md bg-white px-2 py-1 rounded-lg border border-slate-200">{n.data.transactionHash}</span>
                      </div>
                    )}

                    {/* Failure reason */}
                    {n.data?.reason && (
                      <div className="p-4 bg-red-50 rounded-[16px] text-sm text-red-700 border border-red-100 font-medium mt-2 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Rejection Detail: {n.data.reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
