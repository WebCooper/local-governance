"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { useCitizen } from "./CitizenContext";
import { useReportStatus, ReportJobProgress, ReportJobStatus } from "@/lib/useReportStatus";
import { useVoteStatus } from "@/lib/useVoteStatus";

// ── Notification record stored in state + localStorage ───────────────────────

export interface ReportNotification {
  jobId: string;
  category: string;              // e.g. "Infrastructure Damage"
  status: ReportJobStatus;
  percent: number;
  message: string;
  data?: Record<string, any>;   // txHash, blockNumber, ipfsCID, reason …
  timestamp: number;            // Date.now() when last updated
  isRead: boolean;
}

// ── Terminal states — no more progress expected after these ──────────────────
const TERMINAL_STATES: ReportJobStatus[] = [
  "completed",
  "failed",
  "ai_moderation_failed",
  "ipfs_failed",
  "blockchain_failed",
];

const isTerminal = (s: ReportJobStatus) => TERMINAL_STATES.includes(s);

// ── Toast messages for terminal states ───────────────────────────────────────
function toastForStatus(n: ReportNotification) {
  const label = n.category || "Report";
  switch (n.status) {
    case "completed":
      toast.success(`✅ ${label} was successfully recorded on-chain!`, { duration: 6000 });
      break;
    case "ai_moderation_failed":
      toast.error(`🚫 ${label} was rejected by AI moderation.\n${n.data?.reason ?? ""}`, {
        duration: 8000,
      });
      break;
    case "ipfs_failed":
      toast.error(`📦 ${label}: IPFS upload failed after 3 retries.`, { duration: 6000 });
      break;
    case "blockchain_failed":
      toast.error(`⛓️ ${label}: Blockchain submission failed after 3 retries.`, { duration: 6000 });
      break;
    case "failed":
      toast.error(`❌ ${label} processing failed unexpectedly.`, { duration: 6000 });
      break;
  }
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function storageKey(address: string) {
  return `ac_notifications_${address.toLowerCase()}`;
}

function loadFromStorage(address: string): ReportNotification[] {
  try {
    const raw = localStorage.getItem(storageKey(address));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(address: string, notifications: ReportNotification[]) {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(notifications));
  } catch {
    // Storage quota — ignore
  }
}

// ── Context shape ─────────────────────────────────────────────────────────────

interface NotificationContextType {
  notifications: ReportNotification[];
  unreadCount: number;
  addPendingJob: (jobId: string, category: string) => void;
  markAsRead: (jobId: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

// ── Provider ──────────────────────────────────────────────────────────────────

export const NotificationProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { wallet } = useCitizen();
  const address = wallet?.publicKey ?? null;

  const [notifications, setNotifications] = useState<ReportNotification[]>([]);

  // SSE hook — opens a stream keyed by wallet address
  const { events: sseEvents } = useReportStatus(address);
  const { events: voteEvents } = useVoteStatus(address);

  // ── Load persisted notifications when wallet connects ─────────────────────
  useEffect(() => {
    if (!address) {
      setNotifications([]);
      return;
    }
    setNotifications(loadFromStorage(address));
  }, [address]);

  // ── Sync with backend on wallet connection / page load ──────────────────────
  useEffect(() => {
    if (!address) return;

    const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL || "";
    fetch(`${relayerUrl}/report/status/citizen/${address}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body?.jobs || !Array.isArray(body.jobs)) return;
        setNotifications((prev) => {
          const map = new Map(prev.map((n) => [n.jobId, n]));
          let updated = false;

          for (const serverJob of body.jobs) {
            const existing = map.get(serverJob.jobId);
            if (existing) {
              if (
                existing.status !== serverJob.step ||
                (serverJob.failedReason && !existing.data?.reason)
              ) {
                updated = true;
                map.set(serverJob.jobId, {
                  ...existing,
                  status: serverJob.step as ReportJobStatus,
                  percent: serverJob.state === "completed" ? 100 : existing.percent,
                  message: serverJob.failedReason || existing.message,
                  data: {
                    ...existing.data,
                    reason: serverJob.failedReason ?? existing.data?.reason,
                  },
                });
              }
            } else {
              updated = true;
              map.set(serverJob.jobId, {
                jobId: serverJob.jobId,
                category: serverJob.category || "Report",
                status: serverJob.step as ReportJobStatus,
                percent: serverJob.state === "completed" ? 100 : 0,
                message: serverJob.failedReason || "Report queued for processing…",
                data: { reason: serverJob.failedReason },
                timestamp: serverJob.timestamp || Date.now(),
                isRead: false,
              });
            }
          }

          if (!updated) return prev;
          return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
        });
      })
      .catch(() => {
        // Relayer unreachable or offline — keep local state
      });
  }, [address]);

  // ── Persist to localStorage whenever notifications change ─────────────────
  useEffect(() => {
    if (!address) return;
    saveToStorage(address, notifications);
  }, [address, notifications]);

  // ── Apply incoming SSE events to the notifications list ───────────────────
  useEffect(() => {
    if (sseEvents.size === 0) return;

    setNotifications((prev) => {
      let changed = false;
      const map = new Map(prev.map((n) => [n.jobId, n]));

      sseEvents.forEach((event, jobId) => {
        const existing = map.get(jobId);
        if (existing) {
          if (isTerminal(existing.status)) return;
          if (
            existing.status !== event.step ||
            existing.percent !== event.percent ||
            existing.message !== event.message
          ) {
            changed = true;
            map.set(jobId, {
              ...existing,
              status: event.step,
              percent: event.percent,
              message: event.message,
              data: { ...existing.data, ...event.data },
              timestamp: Date.now(),
            });
          }
        } else {
          changed = true;
          map.set(jobId, {
            jobId: event.jobId,
            category: "Report",
            status: event.step,
            percent: event.percent,
            message: event.message,
            data: event.data,
            timestamp: Date.now(),
            isRead: false,
          });
        }
      });

      if (!changed) return prev;
      return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
    });
  }, [sseEvents]);

  // ── Apply incoming Vote SSE events to the notifications list ────────────────
  useEffect(() => {
    if (voteEvents.size === 0) return;

    setNotifications((prev) => {
      let changed = false;
      const map = new Map(prev.map((n) => [n.jobId, n]));

      voteEvents.forEach((event, jobId) => {
        const existing = map.get(jobId);
        if (existing) {
          if (isTerminal(existing.status)) return;
          if (
            existing.status !== event.step ||
            existing.percent !== event.percent ||
            existing.message !== event.message
          ) {
            changed = true;
            map.set(jobId, {
              ...existing,
              status: event.step,
              percent: event.percent,
              message: event.message,
              data: { ...existing.data, ...event.data },
              timestamp: Date.now(),
            });
          }
        } else {
          changed = true;
          map.set(jobId, {
            jobId: event.jobId,
            category: "Vote",
            status: event.step,
            percent: event.percent,
            message: event.message,
            data: event.data,
            timestamp: Date.now(),
            isRead: false,
          });
        }
      });

      if (!changed) return prev;
      return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
    });
  }, [voteEvents]);

  // ── Fire toasts for newly-terminal notifications ──────────────────────────
  const toastedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const n of notifications) {
      if (isTerminal(n.status) && !toastedRef.current.has(n.jobId)) {
        toastedRef.current.add(n.jobId);
        toastForStatus(n);
      }
    }
  }, [notifications]);

  // ── Public API ────────────────────────────────────────────────────────────

  const addPendingJob = useCallback((jobId: string, category: string) => {
    const newNotification: ReportNotification = {
      jobId,
      category,
      status: "pending",
      percent: 0,
      message: "Report queued for processing…",
      timestamp: Date.now(),
      isRead: false,
    };
    setNotifications((prev) => [newNotification, ...prev]);
  }, []);

  const markAsRead = useCallback((jobId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.jobId === jobId ? { ...n, isRead: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addPendingJob,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
};
