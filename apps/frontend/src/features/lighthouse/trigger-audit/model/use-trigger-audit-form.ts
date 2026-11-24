"use client";

import type * as React from "react";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AuditJob,
  DEFAULT_LIGHTHOUSE_CATEGORIES,
  type LighthouseCategoryId,
  type LighthouseFormFactor,
  type LighthouseThrottlingMethod,
  LighthouseThrottlingMethodSchema,
  TriggerLighthouseAuditRequestSchema,
} from "@devtools/lighthouse/schemas";
import {
  buildActiveJobUrl,
  extractDistinctUrls,
  lighthouseMutationKeys,
  lighthouseQueries,
  triggerLighthouseAudit,
} from "@/entities/lighthouse-run";
import { ApiRequestError } from "@/shared/api";
import { updateNativeSearchParams } from "@/shared/lib";

export const TRIGGER_ITERATION_ITEMS: Record<string, string> = {
  "1": "1 iteration (Fast)",
  "3": "3 iterations (Median)",
  "5": "5 iterations (Stable)",
};

export function extractConflictJobId(error: unknown): string | null {
  if (!(error instanceof ApiRequestError) || error.status !== 409) {
    return null;
  }
  const details = error.details;
  if (
    typeof details === "object" &&
    details !== null &&
    "activeJobId" in details &&
    typeof details.activeJobId === "string"
  ) {
    return details.activeJobId;
  }
  return null;
}

export function getSubmitErrorMessage(
  validationError: string | null,
  mutationError: unknown,
  conflictJobId: string | null,
): string | null {
  if (validationError) {
    return validationError;
  }
  if (!mutationError || conflictJobId) {
    return null;
  }
  return mutationError instanceof Error
    ? mutationError.message
    : "Failed to start Audit Job";
}

function useTriggerAuditFields(initialUrl: string) {
  const [url, setUrl] = useState(initialUrl);
  const [formFactor, setFormFactor] = useState<LighthouseFormFactor>("mobile");
  const [throttlingMethod, setThrottlingMethod] =
    useState<LighthouseThrottlingMethod>("simulate");
  const [runs, setRuns] = useState("1");
  const [categories, setCategories] = useState<LighthouseCategoryId[]>([
    ...DEFAULT_LIGHTHOUSE_CATEGORIES,
  ]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleUrlChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(event.target.value);
      setValidationError(null);
    },
    [],
  );

  const handleThrottlingChange = useCallback((value: string | null) => {
    const parsed = LighthouseThrottlingMethodSchema.safeParse(value);
    if (parsed.success) {
      setThrottlingMethod(parsed.data);
    }
  }, []);

  const handleRunsChange = useCallback((value: string | null) => {
    if (value && Object.hasOwn(TRIGGER_ITERATION_ITEMS, value)) {
      setRuns(value);
    }
  }, []);

  const handleToggleCategory = useCallback(
    (categoryId: LighthouseCategoryId) => {
      setCategories((prev) =>
        prev.includes(categoryId)
          ? prev.filter((item) => item !== categoryId)
          : [...prev, categoryId],
      );
      setValidationError(null);
    },
    [],
  );

  return {
    url,
    setUrl,
    formFactor,
    setFormFactor,
    throttlingMethod,
    runs,
    categories,
    validationError,
    setValidationError,
    handleUrlChange,
    handleThrottlingChange,
    handleRunsChange,
    handleToggleCategory,
  };
}

interface ConflictState {
  jobId: string;
  recordedAtUpdateCount: number;
}

function useTriggerAuditMutation({
  onClose,
  onJobStarted,
  setConflict,
}: {
  onClose: () => void;
  onJobStarted?: (job: AuditJob) => void;
  setConflict: (conflict: ConflictState | null) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: lighthouseMutationKeys.triggerAudit,
    mutationFn: triggerLighthouseAudit,
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: lighthouseQueries.activeJob().queryKey,
      });
      onClose();
      if (onJobStarted) {
        onJobStarted(response.job);
        return;
      }
      if (pathname === "/lighthouse/run") {
        updateNativeSearchParams(new URLSearchParams({ job: response.job.id }));
        return;
      }
      router.push(buildActiveJobUrl(response.job.id));
    },
    onError: (error) => {
      const activeId = extractConflictJobId(error);
      if (activeId) {
        const recordedAtUpdateCount =
          queryClient.getQueryState(lighthouseQueries.activeJob().queryKey)
            ?.dataUpdateCount ?? 0;
        setConflict({ jobId: activeId, recordedAtUpdateCount });
        void queryClient.invalidateQueries({
          queryKey: lighthouseQueries.activeJob().queryKey,
        });
      }
    },
  });
}

/**
 * Controller hook managing form fields, schema validation, recent URLs, active-job conflicts,
 * and audit trigger submission for {@link TriggerAuditForm}.
 */
export function useTriggerAuditForm({
  initialUrl,
  onClose,
  onJobStarted,
}: {
  initialUrl: string;
  onClose: () => void;
  onJobStarted?: (job: AuditJob) => void;
}) {
  const fields = useTriggerAuditFields(initialUrl);
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const activeJobQuery = useQuery(lighthouseQueries.activeJob());
  const recentRunsQuery = useQuery(lighthouseQueries.recentUrls());

  const quickTargetUrls = useMemo(
    () => extractDistinctUrls(recentRunsQuery.data?.runs ?? []).slice(0, 3),
    [recentRunsQuery.data?.runs],
  );

  const mutation = useTriggerAuditMutation({
    onClose,
    onJobStarted,
    setConflict,
  });

  const {
    url,
    formFactor,
    throttlingMethod,
    runs,
    categories,
    validationError,
    setValidationError,
  } = fields;

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setValidationError(null);
      setConflict(null);

      const parsed = TriggerLighthouseAuditRequestSchema.safeParse({
        url,
        formFactor,
        throttlingMethod,
        runs: Number.parseInt(runs, 10),
        categories,
      });

      if (!parsed.success) {
        setValidationError(
          parsed.error.issues[0]?.message ?? "Invalid audit configuration",
        );
        return;
      }

      mutation.mutate(parsed.data);
    },
    [
      categories,
      formFactor,
      mutation,
      runs,
      setValidationError,
      throttlingMethod,
      url,
    ],
  );

  const activeJob =
    activeJobQuery.data?.active === true ? activeJobQuery.data.job : null;
  const activeJobUpdateCount =
    queryClient.getQueryState(lighthouseQueries.activeJob().queryKey)
      ?.dataUpdateCount ?? 0;
  const conflictResolvedByServer =
    conflict !== null &&
    !activeJobQuery.isFetching &&
    activeJobQuery.data?.active === false &&
    activeJobUpdateCount > conflict.recordedAtUpdateCount;
  const activeConflictJobId =
    conflict && !conflictResolvedByServer ? conflict.jobId : null;

  return {
    ...fields,
    quickTargetUrls,
    activeJob,
    effectiveActiveJobId: activeJob?.id ?? activeConflictJobId,
    isPending: mutation.isPending,
    submissionErrorMessage: getSubmitErrorMessage(
      validationError,
      mutation.error,
      conflict?.jobId ?? null,
    ),
    handleSubmit,
  };
}
