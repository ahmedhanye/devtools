"use client";

import type * as React from "react";
import { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type {
  AuditJob,
  LighthouseCategoryId,
  LighthouseFormFactor,
} from "@devtools/lighthouse/schemas";
import { AlertCircle, Monitor, Play, Smartphone } from "lucide-react";
import {
  buildActiveJobUrl,
  CATEGORY_LABELS,
  shortUrlLabel,
  THROTTLING_METHOD_LABELS,
} from "@/entities/lighthouse-run";
import {
  cn,
  isPlainPrimaryClick,
  updateNativeSearchParams,
} from "@/shared/lib";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Input,
  Label,
  OptionSelect,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui";
import {
  TRIGGER_ITERATION_ITEMS,
  useTriggerAuditForm,
} from "../model/use-trigger-audit-form";

const THROTTLING_OPTIONS = [
  { value: "simulate", label: THROTTLING_METHOD_LABELS.simulate },
  { value: "devtools", label: THROTTLING_METHOD_LABELS.devtools },
  { value: "provided", label: THROTTLING_METHOD_LABELS.provided },
] as const;

const ITERATION_OPTIONS = [
  { value: "1", label: "1 iteration (Fast)" },
  { value: "3", label: "3 iterations (Median)" },
  { value: "5", label: "5 iterations (Stable)" },
] as const;

const DEVICE_PROFILES: readonly {
  value: LighthouseFormFactor;
  title: string;
  subtitle: string;
  Icon: typeof Smartphone;
}[] = [
  {
    value: "mobile",
    title: "Mobile",
    subtitle: "412 × 823 · Moto G Power",
    Icon: Smartphone,
  },
  {
    value: "desktop",
    title: "Desktop",
    subtitle: "1350 × 940 · Dense 4G",
    Icon: Monitor,
  },
];

const CATEGORY_DESCRIPTIONS: Record<LighthouseCategoryId, string> = {
  performance: "CWV metrics & insights",
  accessibility: "WCAG & contrast checks",
  "best-practices": "Security & modern APIs",
  seo: "Crawlability & metadata",
};

const CATEGORY_ORDER: readonly LighthouseCategoryId[] = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
];

function DeviceProfileCard({
  profile,
  selected,
  onSelect,
}: {
  profile: (typeof DEVICE_PROFILES)[number];
  selected: boolean;
  onSelect: (value: LighthouseFormFactor) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(profile.value);
  }, [onSelect, profile.value]);
  const { Icon } = profile;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={handleClick}
      className={cn(
        "border-border bg-card hover:bg-accent/50 flex items-start gap-2.5 rounded-lg border p-3 text-start transition-colors",
        selected ? "border-primary bg-accent/40 ring-primary/20 ring-2" : "",
      )}
    >
      <Icon className="text-foreground mt-0.5 size-4 shrink-0" />
      <div>
        <div className="text-foreground text-sm font-semibold">
          {profile.title}
        </div>
        <div className="text-muted-foreground text-xs">{profile.subtitle}</div>
      </div>
    </button>
  );
}

function CategoryCheckboxCard({
  categoryId,
  checked,
  onToggle,
}: {
  categoryId: LighthouseCategoryId;
  checked: boolean;
  onToggle: (categoryId: LighthouseCategoryId) => void;
}) {
  const handleCheckedChange = useCallback(() => {
    onToggle(categoryId);
  }, [categoryId, onToggle]);

  return (
    <label
      className={cn(
        "border-border bg-card hover:bg-accent/50 flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-start transition-colors",
        checked ? "border-primary/50 bg-accent/30" : "",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={handleCheckedChange} />
      <div className="min-w-0">
        <div className="text-foreground text-xs font-medium">
          {CATEGORY_LABELS[categoryId]}
        </div>
        <div className="text-muted-foreground text-xs">
          {CATEGORY_DESCRIPTIONS[categoryId]}
        </div>
      </div>
    </label>
  );
}

function ActiveJobBlockerAlert({
  jobId,
  jobUrl,
  onNavigate,
}: {
  jobId: string;
  jobUrl?: string;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const handleLinkClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainPrimaryClick(event)) {
        return;
      }
      if (pathname === "/lighthouse/run") {
        event.preventDefault();
        updateNativeSearchParams(new URLSearchParams({ job: jobId }));
      }
      onNavigate();
    },
    [jobId, onNavigate, pathname],
  );

  return (
    <Alert>
      <AlertCircle className="size-4" />
      <AlertTitle>Audit Job already in progress</AlertTitle>
      <AlertDescription>
        <span>
          Only one Audit Job executes at a time
          {jobUrl ? ` (${shortUrlLabel(jobUrl)})` : ""}.{" "}
        </span>
        <Link
          href={buildActiveJobUrl(jobId)}
          onClick={handleLinkClick}
          className="font-medium underline"
        >
          View live progress
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function TriggerAuditForm({
  initialUrl,
  onClose,
  onJobStarted,
}: {
  initialUrl: string;
  onClose: () => void;
  onJobStarted?: (job: AuditJob) => void;
}) {
  const form = useTriggerAuditForm({ initialUrl, onClose, onJobStarted });

  const submitLabel = form.effectiveActiveJobId
    ? "Audit Job Active..."
    : form.isPending
      ? "Starting Audit..."
      : "Run Lighthouse Audit";

  return (
    <form onSubmit={form.handleSubmit} className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 px-4">
        {form.effectiveActiveJobId ? (
          <ActiveJobBlockerAlert
            jobId={form.effectiveActiveJobId}
            jobUrl={form.activeJob?.url}
            onNavigate={onClose}
          />
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="lighthouse-audit-url">Target URL</Label>
          <Input
            id="lighthouse-audit-url"
            type="url"
            placeholder="https://example.com/"
            value={form.url}
            onChange={form.handleUrlChange}
          />
          {form.quickTargetUrls.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Recent:</span>
              {form.quickTargetUrls.map((entry) => (
                <Button
                  key={entry.url}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => form.setUrl(entry.url)}
                >
                  {entry.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Device &amp; Screen Emulation</Label>
          <div className="grid grid-cols-2 gap-2.5">
            {DEVICE_PROFILES.map((profile) => (
              <DeviceProfileCard
                key={profile.value}
                profile={profile}
                selected={form.formFactor === profile.value}
                onSelect={form.setFormFactor}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OptionSelect
            id="lighthouse-throttling"
            label="Throttling Method"
            value={form.throttlingMethod}
            items={THROTTLING_METHOD_LABELS}
            options={THROTTLING_OPTIONS}
            onValueChange={form.handleThrottlingChange}
            triggerClassName="w-full"
          />
          <OptionSelect
            id="lighthouse-iterations"
            label="Batch Iterations"
            value={form.runs}
            items={TRIGGER_ITERATION_ITEMS}
            options={ITERATION_OPTIONS}
            onValueChange={form.handleRunsChange}
            triggerClassName="w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Audit Categories</Label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_ORDER.map((categoryId) => (
              <CategoryCheckboxCard
                key={categoryId}
                categoryId={categoryId}
                checked={form.categories.includes(categoryId)}
                onToggle={form.handleToggleCategory}
              />
            ))}
          </div>
        </div>

        {form.submissionErrorMessage ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Unable to start audit</AlertTitle>
            <AlertDescription>{form.submissionErrorMessage}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <SheetFooter>
        <Button
          type="submit"
          disabled={Boolean(form.effectiveActiveJobId) || form.isPending}
        >
          <Play className="size-3.5" />
          <span>{submitLabel}</span>
        </Button>
        <SheetClose render={<Button type="button" variant="outline" />}>
          Cancel
        </SheetClose>
      </SheetFooter>
    </form>
  );
}

/**
 * Slide-over Sheet form to configure and start a new Lighthouse Audit Job.
 * Surfaces active-job single-flight blockers and `409 Conflict` notices cleanly.
 */
export function TriggerAuditSheet({
  open,
  onOpenChange,
  initialUrl = "",
  onJobStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  onJobStarted?: (job: AuditJob) => void;
}) {
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>New Lighthouse Audit</SheetTitle>
          <SheetDescription>
            Configure target URL, device emulation, throttling, and batch
            iterations.
          </SheetDescription>
        </SheetHeader>

        {open ? (
          <TriggerAuditForm
            key={initialUrl}
            initialUrl={initialUrl}
            onClose={handleClose}
            onJobStarted={onJobStarted}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
