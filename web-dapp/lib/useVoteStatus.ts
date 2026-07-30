"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ReportJobStatus } from "./useReportStatus";

// ── Types (mirroring backend vote-queue.types.ts) ──────────────────────────

export interface VoteJobProgress {
  jobId: string;
  citizenPubKey: string;
  step: ReportJobStatus;
  percent: number;
  message: string;
  data?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────

const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || "";
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2_000;

/**
 * Opens an SSE connection to the backend for the given citizen address and
 * delivers real-time vote progress events.
 */
export function useVoteStatus(citizenAddress: string | null) {
  const [events, setEvents] = useState<Map<string, VoteJobProgress>>(
    new Map()
  );
  const [isConnected, setIsConnected] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMessage = useCallback((raw: MessageEvent) => {
    try {
      const progress: VoteJobProgress = JSON.parse(raw.data);
      console.log(`[SSE] Received vote-progress event for ${progress.jobId}: ${progress.step} (${progress.percent}%)`);
      setEvents((prev) => {
        const next = new Map(prev);
        next.set(progress.jobId, progress);
        return next;
      });
    } catch (err) {
      console.error("[SSE] Failed to parse vote event payload:", raw.data, err);
    }
  }, []);

  const connect = useCallback(() => {
    if (!citizenAddress || typeof EventSource === "undefined") return;

    esRef.current?.close();

    const url = `${RELAYER_URL}/vote/status/stream?citizenAddress=${encodeURIComponent(
      citizenAddress
    )}`;

    console.log(`[SSE] Connecting to Vote SSE stream: ${url}`);
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("vote-progress", handleMessage);

    es.onopen = () => {
      console.log(`[SSE] Vote stream connected successfully for citizen ${citizenAddress.slice(0, 10)}...`);
      setIsConnected(true);
      reconnectCount.current = 0;
    };

    es.onerror = (err) => {
      console.warn(`[SSE] Vote connection error/disconnect (attempt ${reconnectCount.current + 1}/${MAX_RECONNECT_ATTEMPTS})`, err);
      setIsConnected(false);
      es.close();

      if (reconnectCount.current < MAX_RECONNECT_ATTEMPTS) {
        const delay =
          BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectCount.current);
        reconnectCount.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [citizenAddress, handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { events, isConnected };
}
