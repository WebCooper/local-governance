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

export default function NotificationsPage() {
  const { wallet } = useCitizen();
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useNotifications();

  return (
    <div className="min-h-screen bg-slate-50 pb-28 md:pb-12">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/feed"
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-extrabold rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </h1>
              <p className="text-xs md:text-sm text-slate-500">
                Real-time tracking of your citizen report processing pipeline.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="px-3 py-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clear all</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 md:px-8 pt-6">
        {!wallet ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
            <Shield className="h-10 w-10 text-blue-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900 mb-1">Citizen Login Required</h3>
            <p className="text-sm text-slate-500 mb-4">
              Log in with your GovID to view live report processing updates.
            </p>
            <Link
              href="/login"
              className="inline-block px-5 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition-colors"
            >
              Go to Login
            </Link>
          </div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Bell className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">No Notifications Yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
              When you submit an issue or vote on community reports, pipeline updates will appear here in real-time.
            </p>
            <Link
              href="/report"
              className="inline-block px-5 py-2.5 bg-blue-600 text-white font-semibold text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              Submit a Report
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const config = STATUS_CONFIG[n.status] ?? STATUS_CONFIG.pending;
              const isFailed = n.status.includes("failed");
              const isDone = n.status === "completed";

              return (
                <div
                  key={n.jobId}
                  onClick={() => markAsRead(n.jobId)}
                  className={`bg-white rounded-2xl border p-5 shadow-sm transition-all cursor-pointer hover:border-blue-200 ${
                    !n.isRead ? "border-blue-300 ring-1 ring-blue-100 bg-blue-50/20" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${config.bg}`}>
                        {config.icon}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">
                          {n.category || "Civic Report"}
                        </h4>
                        <p className="text-xs text-slate-400 font-medium">
                          {formatTime(n.timestamp)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${config.bg} ${config.color}`}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  {!isFailed && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-slate-500 font-medium mb-1">
                        <span>Pipeline Progress</span>
                        <span>{n.percent}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            isDone ? "bg-green-500" : "bg-blue-600"
                          }`}
                          style={{ width: `${n.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Message */}
                  <p className="text-sm text-slate-600 leading-relaxed font-medium mb-2">
                    {n.message}
                  </p>

                  {/* Transaction Hash */}
                  {n.data?.transactionHash && (
                    <div className="p-3 bg-slate-50 rounded-xl font-mono text-xs text-green-700 border border-slate-100 flex items-center justify-between">
                      <span className="font-bold">Transaction Hash:</span>
                      <span className="truncate max-w-[200px] sm:max-w-md">{n.data.transactionHash}</span>
                    </div>
                  )}

                  {/* Failure reason */}
                  {n.data?.reason && (
                    <div className="p-3 bg-red-50 rounded-xl text-xs text-red-600 border border-red-100 font-medium">
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
  );
}
