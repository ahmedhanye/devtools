"use client";

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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

function isNewerOrEqualProgress(
  incoming: AuditSseProgressEvent,
  existing: AuditSseProgressEvent | null | undefined,
): boolean {
  if (!existing) {
    return true;
  }
  return (
    new Date(incoming.timestamp).getTime() >=
    new Date(existing.timestamp).getTime()
  );
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
      if (!isNewerOrEqualProgress(event, prev.job.latestProgress)) {
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

function scheduleRetryOrDisconnect(params: {
  isDisposed: () => boolean;
  tracker: StreamTrackerRefs;
  setStreamAttempt: React.Dispatch<React.SetStateAction<number>>;
  setIsStreamDisconnected: React.Dispatch<React.SetStateAction<boolean>>;
}): void {
  const { isDisposed, tracker, setStreamAttempt, setIsStreamDisconnected } =
    params;
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
    return;
  }
  setIsStreamDisconnected(true);
}

async function handleStreamConnectionDrop(params: {
  jobId: string;
  isDisposed: () => boolean;
  tracker: StreamTrackerRefs;
  refetchActiveJob: () => Promise<{
    data?: ActiveAuditJobResponse;
    isError?: boolean;
  }>;
  setStreamAttempt: React.Dispatch<React.SetStateAction<number>>;
  setIsExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStreamDisconnected: React.Dispatch<React.SetStateAction<boolean>>;
}): Promise<void> {
  const {
    jobId,
    isDisposed,
    tracker,
    refetchActiveJob,
    setStreamAttempt,
    setIsExpired,
    setIsStreamDisconnected,
  } = params;

  const result = await refetchActiveJob();
  if (isDisposed() || tracker.terminalReceived) {
    return;
  }

  if (result.isError) {
    scheduleRetryOrDisconnect({
      isDisposed,
      tracker,
      setStreamAttempt,
      setIsStreamDisconnected,
    });
    return;
  }

  const latestActive =
    result.data?.active === true && result.data.job.id === jobId;
  if (latestActive) {
    tracker.sawActive = true;
    tracker.awaitingInactiveFinal = true;
    scheduleRetryOrDisconnect({
      isDisposed,
      tracker,
      setStreamAttempt,
      setIsStreamDisconnected,
    });
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

interface AuditStreamHandlerParams {
  jobId: string;
  queryClient: QueryClient;
  tracker: StreamTrackerRefs;
  isDisposed: () => boolean;
  refetchActiveJob: () => Promise<{
    data?: ActiveAuditJobResponse;
    isError?: boolean;
  }>;
  setLatestProgress: React.Dispatch<
    React.SetStateAction<AuditSseProgressEvent | null>
  >;
  setSseError: React.Dispatch<
    React.SetStateAction<AuditSseErrorEvent["error"] | null>
  >;
  setStreamAttempt: React.Dispatch<React.SetStateAction<number>>;
  setIsExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCompleting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStreamDisconnected: React.Dispatch<React.SetStateAction<boolean>>;
}

function buildAuditStreamHandlers(params: AuditStreamHandlerParams) {
  const {
    jobId,
    queryClient,
    tracker,
    isDisposed,
    refetchActiveJob,
    setLatestProgress,
    setSseError,
    setStreamAttempt,
    setIsExpired,
    setIsCompleting,
    setIsStreamDisconnected,
  } = params;

  return {
    onProgress: (event: AuditSseProgressEvent) => {
      tracker.sawActive = true;
      tracker.retryCount = 0;
      tracker.awaitingInactiveFinal = false;
      setIsStreamDisconnected(false);
      setLatestProgress((prev) =>
        isNewerOrEqualProgress(event, prev) ? event : prev,
      );
      syncActiveJobProgressInCache(queryClient, jobId, event);
    },
    onComplete: (event: AuditSseCompleteEvent) => {
      tracker.terminalReceived = true;
      tracker.awaitingInactiveFinal = false;
      setIsStreamDisconnected(false);
      clearRetryTimer(tracker);
      clearSettleTimer(tracker);
      applyCompletedAuditToCache(queryClient, event);
      setIsCompleting(true);
      tracker.settleTimer = setTimeout(() => {
        tracker.settleTimer = null;
        if (!isDisposed()) {
          updateNativeSearchParams(
            (urlParams) => {
              urlParams.delete("job");
              urlParams.set("id", event.runId);
              urlParams.delete("tab");
            },
            { replace: true },
          );
        }
      }, COMPLETION_SETTLE_MS);
    },
    onError: (event: AuditSseErrorEvent) => {
      tracker.terminalReceived = true;
      tracker.awaitingInactiveFinal = false;
      setIsStreamDisconnected(false);
      clearRetryTimer(tracker);
      setSseError(event.error);
      void queryClient.invalidateQueries({
        queryKey: lighthouseQueries.activeJob().queryKey,
      });
    },
    onConnectionError: () => {
      void handleStreamConnectionDrop({
        jobId,
        isDisposed,
        tracker,
        refetchActiveJob,
        setStreamAttempt,
        setIsExpired,
        setIsStreamDisconnected,
      });
    },
  };
}

function useTrackActiveJobTransitions(
  isJobActive: boolean,
  trackerRef: React.RefObject<StreamTrackerRefs>,
  setStreamAttempt: React.Dispatch<React.SetStateAction<number>>,
) {
  useEffect(() => {
    const tracker = trackerRef.current;
    const wasActive = tracker.prevActive;
    tracker.prevActive = isJobActive;

    if (isJobActive) {
      tracker.sawActive = true;
      return undefined;
    }

    const shouldTriggerFinal =
      wasActive &&
      tracker.awaitingInactiveFinal &&
      !tracker.finalAttemptUsed &&
      !tracker.terminalReceived;

    if (!shouldTriggerFinal) {
      return undefined;
    }

    tracker.awaitingInactiveFinal = false;
    tracker.finalAttemptUsed = true;
    clearRetryTimer(tracker);
    const timer = setTimeout(() => {
      setStreamAttempt((attempt) => attempt + 1);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [isJobActive, setStreamAttempt, trackerRef]);
}

function resolveActiveJob(
  activeJobData: ActiveAuditJobResponse | undefined,
  jobId: string,
) {
  if (activeJobData?.active !== true || activeJobData.job.id !== jobId) {
    return null;
  }
  return activeJobData.job;
}

function useAuditStreamSubscription(
  params: Omit<AuditStreamHandlerParams, "tracker" | "isDisposed"> & {
    trackerRef: React.RefObject<StreamTrackerRefs>;
    streamAttempt: number;
  },
) {
  const {
    jobId,
    queryClient,
    trackerRef,
    refetchActiveJob,
    setLatestProgress,
    setSseError,
    setStreamAttempt,
    setIsExpired,
    setIsCompleting,
    setIsStreamDisconnected,
    streamAttempt,
  } = params;

  useEffect(() => {
    const tracker = trackerRef.current;
    let disposed = false;

    const unsubscribe = subscribeToAuditJob(
      jobId,
      buildAuditStreamHandlers({
        jobId,
        queryClient,
        tracker,
        isDisposed: () => disposed,
        refetchActiveJob,
        setLatestProgress,
        setSseError,
        setStreamAttempt,
        setIsExpired,
        setIsCompleting,
        setIsStreamDisconnected,
      }),
    );

    return () => {
      disposed = true;
      unsubscribe();
      clearRetryTimer(tracker);
      clearSettleTimer(tracker);
    };
  }, [
    jobId,
    queryClient,
    refetchActiveJob,
    setIsCompleting,
    setIsExpired,
    setIsStreamDisconnected,
    setLatestProgress,
    setSseError,
    setStreamAttempt,
    streamAttempt,
    trackerRef,
  ]);
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
  const [isStreamDisconnected, setIsStreamDisconnected] = useState(false);
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

  const activeJob = resolveActiveJob(activeJobData, jobId);

  useTrackActiveJobTransitions(
    activeJob !== null,
    trackerRef,
    setStreamAttempt,
  );

  useAuditStreamSubscription({
    jobId,
    queryClient,
    trackerRef,
    refetchActiveJob,
    setLatestProgress,
    setSseError,
    setStreamAttempt,
    setIsExpired,
    setIsCompleting,
    setIsStreamDisconnected,
    streamAttempt,
  });

  const handleReconnect = useCallback(() => {
    const tracker = trackerRef.current;
    tracker.retryCount = 0;
    tracker.awaitingInactiveFinal = false;
    clearRetryTimer(tracker);
    setIsStreamDisconnected(false);
    setStreamAttempt((attempt) => attempt + 1);
  }, []);

  return {
    activeJob,
    latestProgress,
    sseError,
    isExpired: isExpired && !activeJob,
    isCompleting,
    isStreamDisconnected: isStreamDisconnected && !isExpired,
    handleReconnect,
  };
}
