"use client";

import { useRef, useState } from "react";
import { Bell, CheckCircle2, AlertCircle, Clock, Loader2, X, CheckCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { useNotifications, ReportNotification } from "@/context/NotificationContext";
import { ReportJobStatus } from "@/lib/useReportStatus";
import { useEmergencyPenalty } from "@/lib/useEmergencyPenalty";

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  pending:                    { label: "Queued",         color: "text-slate-500 bg-slate-100",  icon: <Clock className="h-3.5 w-3.5" /> },
  ai_moderation_in_progress:  { label: "AI Review",      color: "text-amber-600 bg-amber-50",   icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  ai_moderation_passed:       { label: "AI Approved",    color: "text-amber-600 bg-amber-50",   icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  ai_moderation_failed:       { label: "AI Rejected",    color: "text-red-600 bg-red-50",       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  ipfs_uploading:             { label: "Uploading",      color: "text-blue-600 bg-blue-50",     icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  ipfs_uploaded:              { label: "Uploaded",       color: "text-blue-600 bg-blue-50",     icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  ipfs_failed:                { label: "Upload Failed",  color: "text-red-600 bg-red-50",       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  blockchain_submitting:      { label: "On-Chain",       color: "text-violet-600 bg-violet-50", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  blockchain_submitted:       { label: "On-Chain",       color: "text-violet-600 bg-violet-50", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  blockchain_failed:          { label: "Chain Failed",   color: "text-red-600 bg-red-50",       icon: <AlertCircle className="h-3.5 w-3.5" /> },
  completed:                  { label: "Confirmed",      color: "text-green-600 bg-green-50",   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  failed:                     { label: "Failed",         color: "text-red-600 bg-red-50",       icon: <AlertCircle className="h-3.5 w-3.5" /> },
};

const PIPELINE_STEPS: ReportJobStatus[] = [
  "ai_moderation_in_progress",
  "ipfs_uploading",
  "blockchain_submitting",
  "completed",
];

function stepIndex(status: ReportJobStatus): number {
  const map: Partial<Record<ReportJobStatus, number>> = {
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

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

// ── Notification card ─────────────────────────────────────────────────────────

function NotificationCard({
  n,
  onRead,
}: {
  n: ReportNotification;
  onRead: (id: string) => void;
}) {
  const config = STATUS_CONFIG[n.status] ?? STATUS_CONFIG.pending;
  const current = stepIndex(n.status);
  const isPenaltyFailed =
    n.status === "blockchain_failed" &&
    (n.data?.isPenalty ||
      n.message.toLowerCase().includes("penalty") ||
      n.message.toLowerCase().includes("locked") ||
      (n.message.includes("3 retries") && (n.category === "Emergency" || n.data?.isEmergency)));
  const isFailed = n.status.includes("failed");
  const isDone = n.status === "completed";
  const isVote = n.category === "Vote";
  
  const displaySteps = isVote ? ["Chain", "Done"] : ["AI", "IPFS", "Chain", "Done"];
  let displayCurrent = current;
  if (isVote) {
    if (current === 2) displayCurrent = 0;
    else if (current === 3) displayCurrent = 1;
    else displayCurrent = -1;
  }

  return (
    <div
      className={`p-4 border-b border-slate-100 last:border-0 transition-colors cursor-pointer hover:bg-slate-50 ${
        !n.isRead ? "bg-blue-50/40" : ""
      }`}
      onClick={() => onRead(n.jobId)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{n.category}</p>
          <p className="text-xs text-slate-500 mt-0.5">{formatTime(n.timestamp)}</p>
        </div>
        {isPenaltyFailed ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 text-amber-700 bg-amber-100 border border-amber-200">
            <AlertTriangle className="h-3 w-3 text-amber-600" />
            Penalty Blocked
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${config.color}`}
          >
            {config.icon}
            {config.label}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!isFailed && (
        <div className="w-full h-1 bg-slate-100 rounded-full mb-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              isDone ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${n.percent}%` }}
          />
        </div>
      )}

      {/* Step indicators */}
      {!isFailed && (
        <div className="flex items-center gap-1 mb-1.5">
          {displaySteps.map((label, i) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${
                  i < displayCurrent
                    ? "bg-green-500 text-white"
                    : i === displayCurrent
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-400"
                }`}
              >
                {i < displayCurrent ? "✓" : i + 1}
              </div>
              {i < displaySteps.length - 1 && (
                <div
                  className={`h-px w-4 transition-colors ${
                    i < displayCurrent ? "bg-green-400" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
          <span className="ml-1 text-[10px] text-slate-400 font-medium">
            {displaySteps[Math.max(0, displayCurrent)]}
          </span>
        </div>
      )}

      {/* Status message */}
      {isPenaltyFailed ? (
        <div className="space-y-1">
          <p className="text-xs text-amber-900 font-semibold leading-relaxed">
            Emergency submission rejected by network safeguard.
          </p>
          <p className="text-[11px] text-amber-700 leading-relaxed bg-amber-50 p-2 rounded-lg border border-amber-100">
            Your ID is currently in a 30-day penalty lock because a previous report was marked as a false alarm / non-emergency. Standard community reports remain available.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
      )}

      {/* Extra data: tx hash */}
      {n.data?.transactionHash && (
        <p className="text-[10px] text-green-600 font-mono mt-1 truncate">
          TX: {n.data.transactionHash.slice(0, 18)}…
        </p>
      )}

      {/* Rejection reason */}
      {n.data?.reason && (
        <p className="text-[10px] text-red-500 mt-1">Reason: {n.data.reason}</p>
      )}

      {/* Unread dot */}
      {!n.isRead && (
        <div className="absolute right-3 top-3 w-2 h-2 bg-blue-500 rounded-full" />
      )}
    </div>
  );
}

// ── Main bell component ────────────────────────────────────────────────────────

export function NotificationBell() {
  const { notifications, unreadCount, markAllAsRead, markAsRead, clearAll } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const penalty = useEmergencyPenalty();

  // Close on outside click
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  return (
    <div
      className="relative"
      ref={ref}
      onBlur={handleBlur}
      tabIndex={-1}
    >
      {/* Bell button */}
      <button
        aria-label="Notifications"
        className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="fixed inset-x-3 top-16 max-w-sm mx-auto sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-900">Submissions</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Active Penalty Banner if user is in penalty box */}
          {penalty.isPenalized && (
            <div className="p-3 bg-amber-50 border-b border-amber-200/80 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-bold text-amber-950">30-Day Penalty Active</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900">
                    {penalty.daysRemaining}d left
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                  Emergency reporting locked until {penalty.penaltyUntilDate?.toLocaleDateString()} due to a false alarm.
                </p>
                {penalty.reason && (
                  <p className="text-[10px] text-amber-900 font-medium mt-1 bg-white/80 p-1.5 rounded border border-amber-200/60 line-clamp-2">
                    &ldquo;{penalty.reason}&rdquo;
                  </p>
                )}
              </div>
            </div>
          )}

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Bell className="h-8 w-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400 font-medium">No notifications yet</p>
                <p className="text-xs text-slate-300 mt-1">
                  Submitted reports will appear here
                </p>
              </div>
            ) : (
              <div className="relative">
                {notifications.map((n) => (
                  <NotificationCard key={n.jobId} n={n} onRead={markAsRead} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
