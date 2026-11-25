"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { LighthouseRunListItem } from "@devtools/lighthouse/schemas";
import {
  AlertCircle,
  GitCompare,
  History,
  Plus,
  RotateCw,
  Search,
} from "lucide-react";
import {
  formatCwvValue,
  formatTimestamp,
  getScoreTone,
  LighthouseEmptyNotice,
  LighthouseHeader,
  shortRunId,
  shortUrlLabel,
  THROTTLING_METHOD_LABELS,
} from "@/entities/lighthouse-run";
import { RunInspectorSheet } from "@/features/lighthouse/inspect-run";
import { TriggerAuditSheet } from "@/features/lighthouse/trigger-audit";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OptionSelect,
  Skeleton,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import {
  HISTORY_PAGE_SIZE,
  type HistoryFiltersModel,
  type HistoryTableStateModel,
  useHistoryController,
} from "../model/use-history-filters";

const DEVICE_FILTER_ITEMS: Record<string, string> = {
  all: "All Devices",
  mobile: "Mobile",
  desktop: "Desktop",
};

const THROTTLING_FILTER_ITEMS: Record<string, string> = {
  all: "All Throttling",
  simulate: THROTTLING_METHOD_LABELS.simulate,
  devtools: THROTTLING_METHOD_LABELS.devtools,
  provided: THROTTLING_METHOD_LABELS.provided,
};

const HISTORY_TABLE_COLUMNS = [
  "Target URL & Timestamp",
  "Profile",
  "Perf",
  "A11y / BP / SEO",
  "LCP / CLS / TBT",
  "Actions",
] as const;

function ScorePill({ label, value }: { label: string; value: number | null }) {
  return (
    <Badge variant={getScoreTone(value)}>
      {label} {value ?? "—"}
    </Badge>
  );
}

function HistoryLatestStrip({
  run,
  onInspect,
  onRerun,
}: {
  run: LighthouseRunListItem | null;
  onInspect: (runId: string) => void;
  onRerun: (url: string) => void;
}) {
  if (!run) {
    return null;
  }

  return (
    <div className="border-border bg-card flex flex-col justify-between gap-3 rounded-xl border p-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <Badge variant="info" size="md">
          Latest Audit
        </Badge>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground truncate text-sm font-semibold">
              {run.url}
            </span>
            <Badge variant="neutral">{run.formFactor}</Badge>
            <Badge variant="outline">{run.throttlingMethod}</Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {formatTimestamp(run.createdAt)} · LCP{" "}
            {formatCwvValue("lcpMs", run.lcpMs)} · CLS{" "}
            {formatCwvValue("cls", run.cls)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ScorePill label="P" value={run.performanceScore} />
          <ScorePill label="A" value={run.accessibilityScore} />
          <ScorePill label="BP" value={run.bestPracticesScore} />
          <ScorePill label="SEO" value={run.seoScore} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onInspect(run.id)}
        >
          Inspect
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onRerun(run.url)}
        >
          <RotateCw className="size-3.5" />
          <span>Re-run</span>
        </Button>
      </div>
    </div>
  );
}

function HistorySelectionBar({
  selectedCount,
  compareHref,
  onClear,
}: {
  selectedCount: number;
  compareHref: string;
  onClear: () => void;
}) {
  if (selectedCount < 2) {
    return null;
  }

  return (
    <div className="border-info-border bg-info-subtle text-info-subtle-foreground flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5">
      <span className="text-sm">
        <strong>{selectedCount} runs selected</strong> for comparison
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
        <Link
          href={compareHref}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors"
        >
          <GitCompare className="size-3.5" />
          <span>Compare Selected ({selectedCount} Runs)</span>
        </Link>
      </div>
    </div>
  );
}

function HistoryFilterToolbar({ filters }: { filters: HistoryFiltersModel }) {
  const urlSelectOptions = [
    { value: "all", label: "All URLs & Domains" },
    ...filters.urlOptions.map((opt) => ({
      value: opt.url,
      label: shortUrlLabel(opt.url),
    })),
  ];

  const deviceOptions = [
    { value: "all", label: "All Devices" },
    { value: "mobile", label: "Mobile" },
    { value: "desktop", label: "Desktop" },
  ];

  const throttlingOptions = [
    { value: "all", label: "All Throttling" },
    { value: "simulate", label: THROTTLING_METHOD_LABELS.simulate },
    { value: "devtools", label: THROTTLING_METHOD_LABELS.devtools },
    { value: "provided", label: THROTTLING_METHOD_LABELS.provided },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-56 flex-1">
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={filters.search}
            onChange={filters.onSearchChange}
            placeholder="Search URL or domain..."
            aria-label="Search Audit Runs"
          />
        </InputGroup>
      </div>

      <OptionSelect
        ariaLabel="Filter by URL"
        triggerClassName="w-56"
        value={filters.urlFilter}
        items={filters.urlFilterItems}
        options={urlSelectOptions}
        onValueChange={filters.onUrlChange}
      />

      <OptionSelect
        ariaLabel="Filter by device"
        triggerClassName="w-36"
        value={filters.deviceFilter}
        items={DEVICE_FILTER_ITEMS}
        options={deviceOptions}
        onValueChange={filters.onDeviceChange}
      />

      <OptionSelect
        ariaLabel="Filter by throttling"
        triggerClassName="w-44"
        value={filters.throttlingFilter}
        items={THROTTLING_FILTER_ITEMS}
        options={throttlingOptions}
        onValueChange={filters.onThrottlingChange}
      />

      {filters.hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={filters.onClear}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}

function HistoryTableRow({
  run,
  checked,
  onToggleCheck,
  onInspect,
  onRerun,
}: {
  run: LighthouseRunListItem;
  checked: boolean;
  onToggleCheck: (run: LighthouseRunListItem) => void;
  onInspect: (runId: string) => void;
  onRerun: (url: string) => void;
}) {
  const handleCheckedChange = useCallback(() => {
    onToggleCheck(run);
  }, [onToggleCheck, run]);

  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={checked}
          onCheckedChange={handleCheckedChange}
          aria-label={`Select run ${shortRunId(run.id)}`}
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-foreground font-medium">{run.url}</span>
          <span className="text-muted-foreground text-xs">
            {formatTimestamp(run.createdAt)} ·{" "}
            <span className="font-mono">{shortRunId(run.id)}</span>
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="neutral">{run.formFactor}</Badge>
          <Badge variant="outline">{run.throttlingMethod}</Badge>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={getScoreTone(run.performanceScore)}>
          {run.performanceScore ?? "—"}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs tabular-nums">
          {run.accessibilityScore ?? "—"} / {run.bestPracticesScore ?? "—"} /{" "}
          {run.seoScore ?? "—"}
        </span>
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs tabular-nums">
          {formatCwvValue("lcpMs", run.lcpMs)} ·{" "}
          {formatCwvValue("cls", run.cls)} ·{" "}
          {formatCwvValue("tbtMs", run.tbtMs)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onInspect(run.id)}
          >
            Inspect
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRerun(run.url)}
          >
            Re-run
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function HistoryEmptyOrError({
  hasFilters,
  errorMessage,
  onClearFilters,
  onOpenNewAudit,
  onRetry,
}: {
  hasFilters: boolean;
  errorMessage: string | null;
  onClearFilters: () => void;
  onOpenNewAudit: () => void;
  onRetry: () => void;
}) {
  if (errorMessage) {
    return (
      <LighthouseEmptyNotice
        icon={<AlertCircle />}
        title="Unable to load Audit History"
        description={errorMessage}
        action={
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }

  if (hasFilters) {
    return (
      <LighthouseEmptyNotice
        icon={<History />}
        title="No Audit Runs match the current filters"
        description="Clear or adjust active filters to inspect saved Audit Runs."
        action={
          <Button type="button" variant="outline" onClick={onClearFilters}>
            Reset Filters
          </Button>
        }
      />
    );
  }

  return (
    <LighthouseEmptyNotice
      icon={<History />}
      title="No Audit Runs recorded yet"
      description="Trigger your first Lighthouse Audit Job to track category scores, Core Web Vitals, and Insight Audits."
      action={
        <Button type="button" onClick={onOpenNewAudit}>
          <Plus className="size-4" />
          <span>Run First Audit</span>
        </Button>
      }
    />
  );
}

function HistoryPaginationBar({
  offset,
  countOnPage,
  total,
  isPlaceholderData,
  onPrevPage,
  onNextPage,
}: {
  offset: number;
  countOnPage: number;
  total: number;
  isPlaceholderData: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
}) {
  if (total <= HISTORY_PAGE_SIZE) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t pt-3">
      <span className="text-muted-foreground text-xs tabular-nums">
        Showing {offset + 1}–{Math.min(offset + countOnPage, total)} of {total}{" "}
        runs
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPlaceholderData || offset === 0}
          onClick={onPrevPage}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPlaceholderData || offset + HISTORY_PAGE_SIZE >= total}
          onClick={onNextPage}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function HistoryRunsTable({
  state,
  onInspect,
  onRerun,
}: {
  state: HistoryTableStateModel;
  onInspect: (runId: string) => void;
  onRerun: (url: string) => void;
}) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                checked={state.allVisibleChecked}
                onCheckedChange={state.onToggleAllVisible}
                aria-label="Select all visible runs"
              />
            </TableHead>
            {HISTORY_TABLE_COLUMNS.map((heading) => (
              <TableHead key={heading}>{heading}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.runs.map((run) => (
            <HistoryTableRow
              key={run.id}
              run={run}
              checked={Boolean(state.checkedRunsById[run.id])}
              onToggleCheck={state.onToggleCheck}
              onInspect={onInspect}
              onRerun={onRerun}
            />
          ))}
        </TableBody>
      </Table>

      <HistoryPaginationBar
        offset={state.offset}
        countOnPage={state.runs.length}
        total={state.total}
        isPlaceholderData={state.isPlaceholderData}
        onPrevPage={state.onPrevPage}
        onNextPage={state.onNextPage}
      />
    </>
  );
}

function HistoryTableBody({
  state,
  onInspect,
  onRerun,
  onOpenNewAudit,
}: {
  state: HistoryTableStateModel;
  onInspect: (runId: string) => void;
  onRerun: (url: string) => void;
  onOpenNewAudit: () => void;
}) {
  if (state.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (state.errorMessage || state.runs.length === 0) {
    return (
      <HistoryEmptyOrError
        hasFilters={state.hasFilters}
        errorMessage={state.errorMessage}
        onClearFilters={state.onClearFilters}
        onOpenNewAudit={onOpenNewAudit}
        onRetry={state.onRetry}
      />
    );
  }

  return (
    <HistoryRunsTable state={state} onInspect={onInspect} onRerun={onRerun} />
  );
}

/**
 * Primary Lighthouse Audit History workspace (`/lighthouse`).
 */
export function HistoryPage() {
  const history = useHistoryController();
  const [inspectorRunId, setInspectorRunId] = useState<string | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerInitialUrl, setTriggerInitialUrl] = useState("");

  const handleOpenNewAudit = useCallback(() => {
    setTriggerInitialUrl("");
    setTriggerOpen(true);
  }, []);

  const handleOpenRerun = useCallback((url: string) => {
    setTriggerInitialUrl(url);
    setTriggerOpen(true);
  }, []);

  const handleInspectorOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setInspectorRunId(null);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <LighthouseHeader activeView="history" onNewAudit={handleOpenNewAudit} />

      <HistoryLatestStrip
        run={history.latestRun}
        onInspect={setInspectorRunId}
        onRerun={handleOpenRerun}
      />

      <HistorySelectionBar
        selectedCount={history.checkedCount}
        compareHref={history.compareSelectedHref}
        onClear={history.onClearChecked}
      />

      <Card>
        <CardHeader>
          <CardTitle>Audit History ({history.total})</CardTitle>
          <CardDescription>
            Filter across audited URLs, domains, device profiles, and throttling
            methods. Select 2 or more runs to compare.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4">
            <HistoryFilterToolbar filters={history.filters} />

            <HistoryTableBody
              state={history.tableState}
              onInspect={setInspectorRunId}
              onRerun={handleOpenRerun}
              onOpenNewAudit={handleOpenNewAudit}
            />
          </div>
        </CardContent>
      </Card>

      <RunInspectorSheet
        runId={inspectorRunId}
        onOpenChange={handleInspectorOpenChange}
      />

      <TriggerAuditSheet
        open={triggerOpen}
        onOpenChange={setTriggerOpen}
        initialUrl={triggerInitialUrl}
      />
    </div>
  );
}
