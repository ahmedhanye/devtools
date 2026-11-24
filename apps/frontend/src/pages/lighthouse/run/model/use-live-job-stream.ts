"use client";

import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ActiveAuditJobResponse,
  AuditSseCompleteEvent,
  AuditSseErrorEvent,
  AuditSseProgressEvent,
} from "@devtools/lighthouse/schemas";
import {
  lighthouseQueries,
  subscribeToAuditJob,
} from "@/entities/lighthouse-run";
import { updateNativeSearchParams } from "@/shared/lib";

const MAX_SSE_RETRIES = 4;
const SSE_RETRY_BASE_MS = 250;
const SSE_RETRY_MAX_MS = 4_000;
const COMPLETION_SETTLE_MS = 250;

interface StreamTrackerRefs {
  sawActive: boolean;
  prevActive: boolean;
  awaitingInactiveFinal: boolean;
  finalAttemptUsed: boolean;
  terminalReceived: boolean;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
}

function computeSseRetryDelay(retryCount: number): number {
  return Math.min(SSE_RETRY_BASE_MS * 2 ** retryCount, SSE_RETRY_MAX_MS);
}

function clearRetryTimer(tracker: StreamTrackerRefs): void {
  if (tracker.retryTimer !== null) {
    clearTimeout(tracker.retryTimer);
    tracker.retryTimer = null;
  }
}

function clearSettleTimer(tracker: StreamTrackerRefs): void {
  if (tracker.settleTimer !== null) {
    clearTimeout(tracker.settleTimer);
    tracker.settleTimer = null;
  }
}

function syncActiveJobProgressInCache(
  queryClient: QueryClient,
  jobId: string,
  event: AuditSseProgressEvent,
): void {
  queryClient.setQueryData<ActiveAuditJobResponse>(
    lighthouseQueries.activeJob().queryKey,
    (prev) => {
      if (prev?.active !== true || prev.job.id !== jobId) {
        return prev;
      }
      return {
        ...prev,
        job: {
          ...prev.job,
          latestProgress: event,
        },
      };
    },
  );
}

function applyCompletedAuditToCache(
  queryClient: QueryClient,
  event: AuditSseCompleteEvent,
): void {
  queryClient.setQueryData(
    lighthouseQueries.detail(event.runId).queryKey,
    event.run,
  );
  void queryClient.invalidateQueries({
    queryKey: lighthouseQueries.lists(),
  });
  void queryClient.invalidateQueries({
    queryKey: lighthouseQueries.recentUrls().queryKey,
  });
  void queryClient.invalidateQueries({
    queryKey: lighthouseQueries.activeJob().queryKey,
  });
}

async function handleStreamConnectionDrop(params: {
  jobId: string;
  isDisposed: () => boolean;
  tracker: StreamTrackerRefs;
  refetchActiveJob: () => Promise<{ data?: ActiveAuditJobResponse }>;
  setStreamAttempt: React.Dispatch<React.SetStateAction<number>>;
  setIsExpired: React.Dispatch<React.SetStateAction<boolean>>;
}): Promise<void> {
  const {
    jobId,
    isDisposed,
    tracker,
    refetchActiveJob,
    setStreamAttempt,
    setIsExpired,
  } = params;

  const result = await refetchActiveJob();
  if (isDisposed() || tracker.terminalReceived) {
    return;
  }

  const latestActive =
    result.data?.active === true && result.data.job.id === jobId;
  if (latestActive) {
    tracker.sawActive = true;
    tracker.awaitingInactiveFinal = true;
    if (tracker.retryCount < MAX_SSE_RETRIES) {
      const delayMs = computeSseRetryDelay(tracker.retryCount);
      tracker.retryCount += 1;
      clearRetryTimer(tracker);
      tracker.retryTimer = setTimeout(() => {
        tracker.retryTimer = null;
        if (!isDisposed() && !tracker.terminalReceived) {
          tracker.awaitingInactiveFinal = false;
          setStreamAttempt((attempt) => attempt + 1);
        }
      }, delayMs);
    }
    return;
  }

  if (tracker.sawActive && !tracker.finalAttemptUsed) {
    tracker.awaitingInactiveFinal = false;
    tracker.finalAttemptUsed = true;
    setStreamAttempt((attempt) => attempt + 1);
    return;
  }

  setIsExpired(true);
}

/**
 * Subscribes to live SSE updates for an Audit Job, reconnecting across transient
 * drops while the job remains active and performing a final terminal-snapshot check
 * when the job transitions to inactive before falling back to expired state.
 */
export function useLiveJobStream(jobId: string) {
  const queryClient = useQueryClient();
  const [latestProgress, setLatestProgress] =
    useState<AuditSseProgressEvent | null>(null);
  const [sseError, setSseError] = useState<AuditSseErrorEvent["error"] | null>(
    null,
  );
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const trackerRef = useRef<StreamTrackerRefs>({
    sawActive: false,
    prevActive: false,
    awaitingInactiveFinal: false,
    finalAttemptUsed: false,
    terminalReceived: false,
    retryCount: 0,
    retryTimer: null,
    settleTimer: null,
  });

  const { data: activeJobData, refetch: refetchActiveJob } = useQuery(
    lighthouseQueries.activeJob(),
  );

  const activeJob =
    activeJobData?.active === true && activeJobData.job.id === jobId
      ? activeJobData.job
      : null;
  const isJobActive = activeJob !== null;

  useEffect(() => {
    const tracker = trackerRef.current;
    const wasActive = tracker.prevActive;
    tracker.prevActive = isJobActive;

    if (isJobActive) {
      tracker.sawActive = true;
      return undefined;
    }

    if (
      wasActive &&
      tracker.awaitingInactiveFinal &&
      !tracker.finalAttemptUsed &&
      !tracker.terminalReceived
    ) {
      tracker.awaitingInactiveFinal = false;
      tracker.finalAttemptUsed = true;
      clearRetryTimer(tracker);
      const timer = setTimeout(() => {
        setStreamAttempt((attempt) => attempt + 1);
      }, 0);
      return () => {
        clearTimeout(timer);
      };
    }

    return undefined;
  }, [isJobActive]);

  useEffect(() => {
    const tracker = trackerRef.current;
    let disposed = false;

    const unsubscribe = subscribeToAuditJob(jobId, {
      onProgress: (event) => {
        tracker.retryCount = 0;
        tracker.awaitingInactiveFinal = false;
        setLatestProgress(event);
        syncActiveJobProgressInCache(queryClient, jobId, event);
      },
      onComplete: (event) => {
        tracker.terminalReceived = true;
        tracker.awaitingInactiveFinal = false;
        clearRetryTimer(tracker);
        clearSettleTimer(tracker);
        applyCompletedAuditToCache(queryClient, event);
        setIsCompleting(true);
        tracker.settleTimer = setTimeout(() => {
          tracker.settleTimer = null;
          if (!disposed) {
            updateNativeSearchParams(
              (params) => {
                params.delete("job");
                params.set("id", event.runId);
                params.delete("tab");
              },
              { replace: true },
            );
          }
        }, COMPLETION_SETTLE_MS);
      },
      onError: (event) => {
        tracker.terminalReceived = true;
        tracker.awaitingInactiveFinal = false;
        clearRetryTimer(tracker);
        setSseError(event.error);
        void queryClient.invalidateQueries({
          queryKey: lighthouseQueries.activeJob().queryKey,
        });
      },
      onConnectionError: () => {
        void handleStreamConnectionDrop({
          jobId,
          isDisposed: () => disposed,
          tracker,
          refetchActiveJob,
          setStreamAttempt,
          setIsExpired,
        });
      },
    });

    return () => {
      disposed = true;
      unsubscribe();
      clearRetryTimer(tracker);
      clearSettleTimer(tracker);
    };
  }, [jobId, queryClient, refetchActiveJob, streamAttempt]);

  return {
    activeJob,
    latestProgress,
    sseError,
    isExpired: isExpired && !activeJob,
    isCompleting,
  };
}
