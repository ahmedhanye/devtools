#!/usr/bin/env bun
/**
 * Discover, normalize, inspect, and cluster agent conversation transcripts.
 * Supports Antigravity, Claude Code, Codex CLI, OpenCode, and generic JSONL.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Supported specific coding-agent transcript formats. */
export type SpecificAgentName = "antigravity" | "claude" | "codex" | "opencode" | "generic";

/** CLI `--agent` selector, including auto-discovery across harnesses. */
export type AgentName = "auto" | SpecificAgentName;

/** Normalized speaker/event role across agent transcripts. */
export type Role = "user" | "assistant" | "tool";

/** Single normalized transcript event. */
export interface TranscriptEvent {
  ts: Date | null;
  role: Role;
  text: string;
  userPrompt?: string;
  tools: string;
  toolNames?: string[];
  commands?: string[];
  resultCommand?: string | null;
  ntools: number;
  exit: number | null;
  branch: string | null;
  cwd?: string | null;
  isError?: boolean;
  isCompaction?: boolean;
  step?: number | null;
  spawnedIds?: string[];
}

/** Harness-level API, stream, or runtime error recorded in a session. */
export interface HarnessError {
  ts: string | null;
  step: number | null;
  message: string;
}

/** Session-level metadata extracted by an agent adapter. */
export interface SessionMeta {
  id: string;
  agent?: SpecificAgentName;
  subagent: boolean;
  parentId?: string | null;
  forkedFrom?: string | null;
  cwd?: string | null;
  title?: string | null;
  filePath?: string;
  harnessErrors?: HarnessError[];
  compactions?: number;
  subagentRefs?: string[];
}

/** Tuple of parsed session metadata and normalized events. */
export type SessionData = [SessionMeta, TranscriptEvent[]];

/** Pull request metadata used for branch and PR grouping. */
export interface PullRequest {
  number: number;
  title?: string;
  headRefName: string;
  createdAt?: string;
  mergedAt?: string | null;
  closedAt?: string | null;
}

/** Repository metadata used to filter and cluster sessions. */
export interface RepoContext {
  root: string;
  name: string;
  slug: string | null;
  branches: Set<string>;
  prs: PullRequest[];
}

/** Grouped session cluster emitted in cluster mode. */
export interface ClusterPlanEntry {
  group_id: number | null;
  topic: string;
  branch_or_pr: string;
  conversation_ids: string[];
  turn_count: number;
  summary: string;
  agents?: SpecificAgentName[];
  branches?: string[];
  warnings?: number;
}

/** Cleaned user turn returned by `--inspect`. */
export interface UserTurnEntry {
  index: number;
  step: number | null;
  ts: string | null;
  text: string;
  looks_like_correction: boolean;
}

/** Non-zero exit or error output returned by `--inspect`. */
export interface FailureEntry {
  step: number | null;
  ts: string | null;
  tool: string;
  command: string | null;
  exit: number | null;
  snippet: string;
}

/** Mechanical friction indicators extracted from a session. */
export interface FrictionSignals {
  polling_calls: number;
  hook_bypasses: Array<{ command: string; flag: string }>;
  interactive_calls: number;
  repeated_failures: number;
  compactions: number;
  harness_errors: number;
}

/** Compact summary of a linked child subagent session. */
export interface SubagentSummary {
  id: string;
  turns: number;
  errors: number;
  tool_calls: number;
  summary: string;
}

/** Rich single-session inspection output emitted with `--inspect`. */
export interface SessionDigest {
  id: string;
  agent: SpecificAgentName;
  started_at: string | null;
  ended_at: string | null;
  branch: string | null;
  branches: string[];
  cwd: string | null;
  forked_from: string | null;
  parent_id: string | null;
  subagent: boolean;
  subagent_children: SubagentSummary[];
  user_turns: UserTurnEntry[];
  failures: FailureEntry[];
  harness_errors: HarnessError[];
  friction_signals: FrictionSignals;
  executed_checks: Record<string, number>;
  turns: number;
  errors: number;
  tool_calls: number;
}

/** Environment and filesystem seam options for hermetic callers. */
export interface DiscoveryOptions {
  homeDir?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

interface LiveSessionInfo {
  id: string;
  agent: SpecificAgentName;
  turns: number;
  errors: number;
  tool_calls: number;
  keys: Map<string, number>;
  first_prompt: string;
  first_ts: Date | null;
  last_ts: Date | null;
  subagent: boolean;
  meta: SessionMeta;
  events: TranscriptEvent[];
}

interface CliOptions {
  agent: AgentName;
  logs: string[];
  since?: string;
  until?: string;
  days: number;
  sessions: string[];
  branch?: string;
  pr?: number;
  query?: string;
  inspect: boolean;
  format: "json" | "md";
  prsPath?: string;
  repo?: string;
  allRepos: boolean;
  includeSubagents: boolean;
  includeRetro: boolean;
  includeTrivial: boolean;
  noGh: boolean;
  help: boolean;
}

interface PendingAntigravityTool {
  name: string;
  command: string | null;
  filePath: string | null;
  isRead: boolean;
}

interface TrackedToolCall {
  name: string;
  command: string | null;
  filePath: string | null;
  isRead: boolean;
}

const SPECIFIC_AGENTS: readonly SpecificAgentName[] = [
  "antigravity",
  "claude",
  "codex",
  "opencode",
  "generic",
];

const FILE_READ_TOOLS = new Set([
  "read_file",
  "view_file",
  "view_file_outline",
  "view_code_item",
  "list_dir",
  "find_by_name",
  "grep_search",
  "read",
  "glob",
  "grep",
  "ls",
  "view",
  "search_files",
  "list_files",
]);

const SHELL_TOOLS = new Set([
  "run_command",
  "bash",
  "shell",
  "shell_command",
  "exec_command",
  "run_shell_command",
  "local_shell_call",
  "execute_command",
]);

const DEFAULT_BRANCHES = new Set([
  "main",
  "master",
  "HEAD",
  "origin",
  "upstream",
  "FETCH_HEAD",
  "origin/main",
  "origin/master",
]);

const CORRUPTION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sortedCopy<T>(items: readonly T[], cmp: (a: T, b: T) => number): T[] {
  if (items.length <= 1) return [...items];
  const mid = Math.floor(items.length / 2);
  const left = sortedCopy(items.slice(0, mid), cmp);
  const right = sortedCopy(items.slice(mid), cmp);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left[i];
    const b = right[j];
    if (a === undefined || b === undefined) break;
    if (cmp(a, b) <= 0) {
      out.push(a);
      i += 1;
    } else {
      out.push(b);
      j += 1;
    }
  }
  while (i < left.length) {
    const a = left[i];
    if (a !== undefined) out.push(a);
    i += 1;
  }
  while (j < right.length) {
    const b = right[j];
    if (b !== undefined) out.push(b);
    j += 1;
  }
  return out;
}

function stripAnsi(text: string): string {
  // Strip CSI escape sequences and carriage-return spinner frames without control-char regex warnings.
  const esc = String.fromCharCode(27);
  const csiPattern = new RegExp(`${esc}\\[[0-9;?]*[ -/]*[@-~]`, "g");
  return text.replace(csiPattern, "").replace(/\r[^\n]*\r/g, "");
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 1) return text.slice(0, Math.max(0, maxLen));
  return `${text.slice(0, maxLen - 1)}…`;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseArgsObject(raw: unknown): Record<string, unknown> | null {
  if (isRecord(raw)) return raw;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  const parsed = safeJsonParse(trimmed);
  if (isRecord(parsed)) return parsed;
  if (typeof parsed === "string") {
    const inner = safeJsonParse(parsed);
    return isRecord(inner) ? inner : null;
  }
  return null;
}

function formatError(message: string, cause: string, remediation: string): string {
  return `Error: ${message}\nCause: ${cause}\nRemediation: ${remediation}`;
}

/** Parse ISO timestamps or epoch milliseconds/seconds into `Date`, or `null` if invalid. */
export function parseTs(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    const ms = num < 1e12 ? num * 1000 : num;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const normalized = trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed) ? trimmed : trimmed;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Extract flattened plain text from heterogeneous transcript content shapes. */
export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      const s = textOf(item);
      if (s.length > 0) parts.push(s);
    }
    return parts.join("\n");
  }
  if (!isRecord(content)) return "";
  const direct =
    asString(content.text) ??
    asString(content.output_text) ??
    asString(content.input_text) ??
    asString(content.content) ??
    asString(content.message) ??
    asString(content.error);
  if (direct !== undefined) return direct;
  if (Array.isArray(content.parts)) return textOf(content.parts);
  if (Array.isArray(content.content)) return textOf(content.content);
  return "";
}

function isFileReadContent(text: string): boolean {
  const head = text.slice(0, 600);
  if (/\bShowing lines \d+-\d+ of \d+/i.test(head)) return true;
  if (/^Total bytes:/im.test(head) && /Showing lines/i.test(head)) return true;
  if (/^\s*1:\s/m.test(head) && /\n\s*2:\s/m.test(head) && /Showing lines/i.test(head)) return true;
  return false;
}

function isNoiseEnvelope(text: string): boolean {
  const head = text.trimStart().slice(0, 220);
  return (
    head.startsWith("<environment_context>") ||
    head.startsWith("<INSTRUCTIONS>") ||
    head.startsWith("<permissions instructions>") ||
    head.startsWith("# AGENTS.md instructions for ")
  );
}

function cleanUserText(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").trim();
  const userReqMatch = s.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  if (userReqMatch?.[1] !== undefined) {
    s = userReqMatch[1].trim();
  }
  s = s
    .replace(/<CONTEXT_SUMMARY>[\s\S]*?<\/CONTEXT_SUMMARY>/gi, " ")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, " ")
    .replace(/<SYSTEM_MESSAGE>[\s\S]*?<\/SYSTEM_MESSAGE>/gi, " ")
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi, " ")
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, " ")
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi, " ")
    .replace(/<\/?(?:command-name|command-args|command-message|local-command-stdout)[^>]*>/gi, " ")
    .replace(/^This session is being continued from a previous conversation[^\n]*\n?/im, "")
    .trim();
  return s;
}

/** Produce a compact single-line summary string from a user prompt. */
export function cleanPrompt(text: string): string {
  const cleaned = cleanUserText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("# Resuming from"))
    .map((line) => line.replace(/^#+\s+/, ""))
    .join(" ");
  return truncate(cleaned.replace(/\s+/g, " ").trim(), 120);
}

function extractCommandAndPath(
  toolName: string,
  argsObj: Record<string, unknown> | null,
): { command: string | null; filePath: string | null } {
  const normalized = toolName.toLowerCase();
  if (!argsObj) return { command: null, filePath: null };
  const command =
    asString(argsObj.CommandLine) ??
    asString(argsObj.command) ??
    asString(argsObj.cmd) ??
    asString(argsObj.script) ??
    null;
  const filePath =
    asString(argsObj.Path) ??
    asString(argsObj.file_path) ??
    asString(argsObj.path) ??
    asString(argsObj.TargetFile) ??
    asString(argsObj.AbsolutePath) ??
    asString(argsObj.DirectoryPath) ??
    asString(argsObj.SearchPath) ??
    asString(argsObj.Cwd) ??
    asString(argsObj.workdir) ??
    asString(argsObj.cwd) ??
    null;
  const resolvedCommand =
    command ?? (SHELL_TOOLS.has(normalized) ? asString(argsObj.input) ?? null : null);
  return { command: resolvedCommand, filePath };
}

function summarizeToolInvocation(
  toolName: string,
  command: string | null,
  filePath: string | null,
): string {
  if (command) return `${toolName}(${truncate(command.replace(/\s+/g, " "), 70)})`;
  if (filePath) return `${toolName}(${path.basename(filePath) || filePath})`;
  return toolName;
}

function sanitizeGitBranch(candidate: string | undefined): string | null {
  if (!candidate) return null;
  const cleaned = candidate.trim().replace(/^['"]|['"]$/g, "");
  if (cleaned.length < 2 || cleaned.length > 140) return null;
  if (/[<>\s'"`;\\|&]/.test(cleaned)) return null;
  if (cleaned.startsWith("-") || cleaned.includes("..")) return null;
  if (/^\d+$/.test(cleaned)) return null;
  const stripped = cleaned.replace(/^origin\//, "");
  if (DEFAULT_BRANCHES.has(stripped)) return null;
  return stripped;
}

function extractBranchFromCommandAndOutput(
  command: string | null,
  output: string,
): string | null {
  const isGitStatusOrBranch = Boolean(command && /\bgit\s+(?:status|branch)\b/.test(command));
  const lines = stripAnsi(output).split("\n").slice(0, 60);
  for (const line of lines) {
    const trimmed = line.trim();
    const onBranch = trimmed.match(/^On branch ([A-Za-z0-9._/-]+)$/);
    const switched = trimmed.match(/^Switched to(?: a new)? branch '([^']+)'/);
    const statusTracking = trimmed.match(/^## ([A-Za-z0-9._/-]+?)\.\.\./);
    const statusPlain = isGitStatusOrBranch ? trimmed.match(/^## ([A-Za-z0-9._/-]+)$/) : null;
    const activeBranch = isGitStatusOrBranch ? trimmed.match(/^\* ([A-Za-z0-9._/-]+)$/) : null;
    const commitLine = trimmed.match(/^\[([A-Za-z0-9._/-]+)\s+[0-9a-f]{7,}\]/);
    const headBranch = trimmed.match(/^HEAD branch:\s*([A-Za-z0-9._/-]+)$/);
    const found = sanitizeGitBranch(
      onBranch?.[1] ??
        switched?.[1] ??
        statusTracking?.[1] ??
        statusPlain?.[1] ??
        activeBranch?.[1] ??
        commitLine?.[1] ??
        headBranch?.[1],
    );
    if (found) return found;
  }
  if (command) {
    const checkoutMatch = command.match(
      /\bgit\s+(?:checkout|switch)\s+(?:-[bBcC]\s+)?([A-Za-z0-9._/-]+)/,
    );
    const prCheckout = command.match(/\bgh\s+pr\s+checkout\s+([A-Za-z0-9._/-]+)/);
    const branchFromCmd = sanitizeGitBranch(checkoutMatch?.[1] ?? prCheckout?.[1]);
    if (branchFromCmd) return branchFromCmd;
    if (/\bgit\s+(?:rev-parse\s+--abbrev-ref\s+HEAD|branch\s+--show-current)\b/.test(command)) {
      const firstNonEmpty = lines.map((l) => l.trim()).find((l) => l.length > 0 && !l.startsWith("Command "));
      const fromOutput = sanitizeGitBranch(firstNonEmpty);
      if (fromOutput) return fromOutput;
    }
  }
  return null;
}

function extractCwdHint(filePath: string | null, command: string | null, text: string): string | null {
  if (filePath && path.isAbsolute(filePath)) return filePath;
  if (command) {
    const cdMatch = command.match(/(?:^|&&|\|\||;)\s*cd\s+["']?([^\s"';&|]+)/);
    if (cdMatch?.[1] && path.isAbsolute(cdMatch[1])) return cdMatch[1];
  }
  const absMatch = text.match(/(?:^|\s)(\/(?:home|Users|workspace|workspaces|srv|var|opt|app)\/[^\s"'<>]+)/);
  return absMatch?.[1] ?? null;
}

function extractExitCode(text: string): number | null {
  // Inspect only the leading header so nested command stdout (e.g. log viewers) does not falsify exit codes.
  const header = text.slice(0, 320);
  const direct = header.match(/Command exited with code (\d+)\./);
  if (direct?.[1]) return Number(direct[1]);
  const exitLine = header.match(/(?:^|\n)Exit code:\s*(\d+)\b/);
  if (exitLine?.[1]) return Number(exitLine[1]);
  return null;
}

function looksLikeCorrection(cleanedPrompt: string, turnIndex = 1): boolean {
  if (cleanedPrompt.length === 0) return false;
  if (/^\/(?:wait-what|fix|stop)\b/i.test(cleanedPrompt)) return true;
  if (cleanedPrompt.startsWith("❓")) return true;
  if (
    /^(?:wait|no[,\s!]|stop\b|why did you|why haven'?t|did you read|have you read|don'?t |do not |never |instead\b|wrong\b|revert\b)/i.test(
      cleanedPrompt,
    )
  ) {
    return true;
  }
  if (turnIndex > 1) {
    return /\b(?:should never|never do this|still the same|not be like that|this is stupid|why it still|you missed|why did you)\b/i.test(
      cleanedPrompt,
    );
  }
  return false;
}

function extractAntigravitySessionId(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const brainMatch = normalized.match(/\/brain\/([^/]+)\/\.system_generated\/logs\//);
  if (brainMatch?.[1]) return brainMatch[1];
  const logsIdx = normalized.lastIndexOf("/.system_generated/logs/");
  if (logsIdx > 0) {
    const base = path.basename(normalized.slice(0, logsIdx));
    if (base.length > 0) return base;
  }
  const parent = path.basename(path.dirname(normalized));
  if (parent && parent !== "logs" && parent !== ".") return parent;
  return path.basename(normalized, path.extname(normalized));
}

function readJsonlRecords(filePath: string): Record<string, unknown>[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const parsed = safeJsonParse(line);
    if (isRecord(parsed)) records.push(parsed);
  }
  return records;
}

function resolveAntigravitySourcePath(filePath: string): string {
  const base = path.basename(filePath);
  if (base !== "transcript.jsonl") return filePath;
  const fullSibling = path.join(path.dirname(filePath), "transcript_full.jsonl");
  if (!fs.existsSync(fullSibling)) return filePath;
  // Prefer sibling full log whenever the compact log has truncated fields.
  try {
    const sample = fs.readFileSync(filePath, "utf8");
    if (sample.includes('"truncated_fields"')) return fullSibling;
  } catch {
    return filePath;
  }
  return filePath;
}

function processAntigravityPlanner(
  obj: Record<string, unknown>,
  ts: Date | null,
  step: number | null,
  pendingTools: PendingAntigravityTool[],
): TranscriptEvent | null {
  const toolCalls = Array.isArray(obj.tool_calls) ? obj.tool_calls : [];
  const toolSummaries: string[] = [];
  const toolNames: string[] = [];
  const commands: string[] = [];
  let branch: string | null = null;
  let cwdHint: string | null = null;

  for (const rawTc of toolCalls) {
    if (!isRecord(rawTc)) continue;
    const name = asString(rawTc.name) ?? "tool";
    const argsObj = parseArgsObject(rawTc.args ?? rawTc.arguments ?? rawTc.input);
    const { command, filePath } = extractCommandAndPath(name, argsObj);
    const isRead = FILE_READ_TOOLS.has(name.toLowerCase());
    pendingTools.push({ name, command, filePath, isRead });
    toolNames.push(name);
    if (command) {
      commands.push(command);
      branch = branch ?? extractBranchFromCommandAndOutput(command, "");
    }
    cwdHint = cwdHint ?? extractCwdHint(filePath, command, "");
    toolSummaries.push(summarizeToolInvocation(name, command, filePath));
  }

  const content = textOf(obj.content);
  if (content.length === 0 && toolSummaries.length === 0) return null;
  return {
    ts,
    role: "assistant",
    text: content,
    tools: toolSummaries.join(", "),
    toolNames,
    commands,
    ntools: toolCalls.length,
    exit: null,
    branch,
    cwd: cwdHint,
    step,
  };
}

function processAntigravitySystem(
  obj: Record<string, unknown>,
  ts: Date | null,
  step: number | null,
  meta: SessionMeta,
  bgTasks: Map<string, string>,
): TranscriptEvent | null {
  const raw = asString(obj.content) ?? "";
  if (raw.length === 0) return null;

  if (step === 0 || (meta.subagent === false && meta.parentId === null && raw.includes("[Message]"))) {
    const senderMatch = raw.match(/\bsender=([^\s]+)/);
    const sender = senderMatch?.[1];
    if (sender && !sender.includes("/task-") && sender.includes("-")) {
      meta.subagent = true;
      meta.parentId = sender;
      const contentMatch = raw.match(/\bcontent=([\s\S]*)$/);
      if (contentMatch?.[1] && !meta.title) {
        meta.title = cleanPrompt(contentMatch[1].replace(/\s*<\/SYSTEM_MESSAGE>\s*$/i, ""));
      }
    }
  }

  const taskFinished = raw.match(/Task id "([^"]+)" finished with result:\s*([\s\S]*)/);
  if (taskFinished?.[1]) {
    const taskId = taskFinished[1];
    const body = stripAnsi(taskFinished[2] ?? "");
    const exit = extractExitCode(body);
    const command = bgTasks.get(taskId) ?? null;
    const branch = extractBranchFromCommandAndOutput(command, body);
    const cwd = extractCwdHint(null, command, body);
    return {
      ts,
      role: "tool",
      text: truncate(body, 2000),
      tools: command ? `task(${truncate(command, 60)})` : "task",
      toolNames: ["background_task"],
      commands: [],
      resultCommand: command,
      ntools: 0,
      exit,
      branch,
      cwd,
      isError: exit !== null && exit !== 0,
      step,
    };
  }

  const spawnedFromMsg = raw.match(/\bsender=([0-9a-f-]{36})(?:\/|\s)/i);
  if (spawnedFromMsg?.[1] && spawnedFromMsg[1] !== meta.id && !meta.subagent) {
    meta.subagentRefs = meta.subagentRefs ?? [];
    if (!meta.subagentRefs.includes(spawnedFromMsg[1])) meta.subagentRefs.push(spawnedFromMsg[1]);
  }
  return null;
}

/** Parse an Antigravity `transcript_full.jsonl` or `transcript.jsonl` file. */
export function adaptAntigravity(filePath: string): SessionData {
  const resolved = resolveAntigravitySourcePath(filePath);
  const id = extractAntigravitySessionId(resolved);
  const meta: SessionMeta = {
    id,
    agent: "antigravity",
    subagent: false,
    parentId: null,
    forkedFrom: null,
    filePath: resolved,
    harnessErrors: [],
    compactions: 0,
    subagentRefs: [],
  };

  const events: TranscriptEvent[] = [];
  const pendingTools: PendingAntigravityTool[] = [];
  const bgTasks = new Map<string, string>();
  const records = readJsonlRecords(resolved);

  for (const obj of records) {
    const kind = asString(obj.type) ?? "";
    const step = asNumber(obj.step_index) ?? null;
    const ts = parseTs(obj.created_at);

    if (kind === "USER_INPUT") {
      const rawContent = textOf(obj.content);
      const cleaned = cleanUserText(rawContent);
      events.push({
        ts,
        role: "user",
        text: cleaned,
        userPrompt: cleaned,
        tools: "",
        ntools: 0,
        exit: null,
        branch: null,
        cwd: extractCwdHint(null, null, rawContent),
        step,
      });
      continue;
    }

    if (kind === "PLANNER_RESPONSE") {
      const ev = processAntigravityPlanner(obj, ts, step, pendingTools);
      if (ev) events.push(ev);
      continue;
    }

    if (kind === "CHECKPOINT") {
      meta.compactions = (meta.compactions ?? 0) + 1;
      events.push({
        ts,
        role: "tool",
        text: "Conversation compacted",
        tools: "checkpoint",
        ntools: 0,
        exit: null,
        branch: null,
        isCompaction: true,
        step,
      });
      continue;
    }

    if (kind === "ERROR_MESSAGE") {
      const msg = stripAnsi(asString(obj.error) ?? textOf(obj.content) ?? "Harness error").trim();
      meta.harnessErrors?.push({ ts: ts ? ts.toISOString() : null, step, message: truncate(msg, 400) });
      events.push({
        ts,
        role: "tool",
        text: truncate(msg, 600),
        tools: "harness_error",
        ntools: 0,
        exit: 1,
        branch: null,
        isError: true,
        step,
      });
      continue;
    }

    if (kind === "SYSTEM_MESSAGE") {
      const ev = processAntigravitySystem(obj, ts, step, meta, bgTasks);
      if (ev) events.push(ev);
      continue;
    }

    if (kind === "GENERIC") {
      const rawText = stripAnsi(textOf(obj.content));
      const matchedTool = pendingTools.shift() ?? null;
      const bgStart = rawText.match(
        /Tool is running as a background task with task id:\s*([^\s\n]+)\s*[\r\n]+Task Description:\s*([^\r\n]+)/,
      );
      if (bgStart?.[1]) {
        bgTasks.set(bgStart[1], bgStart[2]?.trim() ?? matchedTool?.command ?? "");
      }

      const subLaunch = rawText.match(/"conversationId"\s*:\s*"([0-9a-f-]{36})"/i);
      const spawnedIds: string[] = [];
      if (subLaunch?.[1] && subLaunch[1] !== meta.id) {
        spawnedIds.push(subLaunch[1]);
        if (!meta.subagentRefs?.includes(subLaunch[1])) meta.subagentRefs?.push(subLaunch[1]);
      }

      const isRead = Boolean(matchedTool?.isRead) || isFileReadContent(rawText);
      const cwd = extractCwdHint(matchedTool?.filePath ?? null, matchedTool?.command ?? null, isRead ? "" : rawText);
      if (isRead) {
        events.push({
          ts,
          role: "tool",
          text: "",
          tools: matchedTool ? summarizeToolInvocation(matchedTool.name, null, matchedTool.filePath) : "read_file",
          ntools: 0,
          exit: null,
          branch: null,
          cwd,
          step,
        });
        continue;
      }

      const exit = extractExitCode(rawText);
      const command = matchedTool?.command ?? bgStart?.[2]?.trim() ?? null;
      const branch = extractBranchFromCommandAndOutput(command, rawText);
      events.push({
        ts,
        role: "tool",
        text: truncate(rawText, 2000),
        tools: matchedTool ? matchedTool.name : "",
        commands: [],
        resultCommand: command,
        ntools: 0,
        exit,
        branch,
        cwd,
        isError: exit !== null && exit !== 0,
        step,
        spawnedIds,
      });
    }
  }

  return [meta, events];
}

function handleClaudeAssistant(
  obj: Record<string, unknown>,
  ts: Date | null,
  cwd: string | null,
  branch: string | null,
  toolMap: Map<string, TrackedToolCall>,
): TranscriptEvent | null {
  const msg = isRecord(obj.message) ? obj.message : null;
  const content = msg?.content;
  const parts: string[] = [];
  const tools: string[] = [];
  const toolNames: string[] = [];
  const commands: string[] = [];
  let ntools = 0;

  if (Array.isArray(content)) {
    for (const block of content) {
      if (!isRecord(block)) continue;
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      } else if (block.type === "tool_use") {
        ntools += 1;
        const name = asString(block.name) ?? "tool";
        const id = asString(block.id);
        const inputObj = parseArgsObject(block.input);
        const { command, filePath } = extractCommandAndPath(name, inputObj);
        const isRead = FILE_READ_TOOLS.has(name.toLowerCase());
        if (id) toolMap.set(id, { name, command, filePath, isRead });
        toolNames.push(name);
        if (command) commands.push(command);
        tools.push(summarizeToolInvocation(name, command, filePath));
      }
    }
  } else {
    const s = textOf(content);
    if (s) parts.push(s);
  }

  if (parts.length === 0 && ntools === 0) return null;
  return {
    ts,
    role: "assistant",
    text: parts.join("\n"),
    tools: tools.join(", "),
    toolNames,
    commands,
    ntools,
    exit: null,
    branch,
    cwd,
  };
}

function handleClaudeUser(
  obj: Record<string, unknown>,
  ts: Date | null,
  cwd: string | null,
  branch: string | null,
  toolMap: Map<string, TrackedToolCall>,
): TranscriptEvent[] {
  const msg = isRecord(obj.message) ? obj.message : null;
  const content = msg?.content;
  const toolUseResult = isRecord(obj.toolUseResult) ? obj.toolUseResult : null;
  const resultEvents: TranscriptEvent[] = [];
  const textParts: string[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (!isRecord(block)) continue;
      if (block.type === "tool_result") {
        const refId = asString(block.tool_use_id) ?? "";
        const tracked = toolMap.get(refId) ?? null;
        const rawOut = stripAnsi(textOf(block.content));
        const isErrorFlag = block.is_error === true;
        const explicitExit = asNumber(toolUseResult?.exitCode) ?? extractExitCode(rawOut);
        const exit = explicitExit ?? (isErrorFlag ? 1 : null);
        const isRead = Boolean(tracked?.isRead) || isFileReadContent(rawOut);
        const evCwd = extractCwdHint(tracked?.filePath ?? null, tracked?.command ?? null, isRead ? "" : rawOut) ?? cwd;
        const evBranch = isRead
          ? branch
          : extractBranchFromCommandAndOutput(tracked?.command ?? null, rawOut) ?? branch;
        resultEvents.push({
          ts,
          role: "tool",
          text: isRead ? "" : truncate(rawOut, 2000),
          tools: tracked ? tracked.name : "tool_result",
          commands: [],
          resultCommand: tracked?.command ?? null,
          ntools: 0,
          exit,
          branch: evBranch,
          cwd: evCwd,
          isError: isErrorFlag || (exit !== null && exit !== 0),
        });
      } else {
        const s = textOf(block);
        if (s.length > 0 && !isNoiseEnvelope(s)) textParts.push(s);
      }
    }
  } else {
    const s = textOf(content);
    if (s.length > 0 && !isNoiseEnvelope(s)) textParts.push(s);
  }

  if (textParts.length > 0 && !obj.isMeta) {
    const cleaned = cleanUserText(textParts.join("\n"));
    if (cleaned.length > 0) {
      resultEvents.unshift({
        ts,
        role: "user",
        text: cleaned,
        userPrompt: cleaned,
        tools: "",
        ntools: 0,
        exit: null,
        branch,
        cwd,
      });
    }
  }
  return resultEvents;
}

/** Parse a Claude Code JSONL transcript. */
export function adaptClaude(filePath: string): SessionData {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const isAgentSubfile = /\/subagents\/agent-[^/]+\.jsonl$/i.test(normalizedPath);
  let id = path.basename(filePath, path.extname(filePath));
  let parentId: string | null = null;
  if (isAgentSubfile) {
    const parentDirMatch = normalizedPath.match(/\/([^/]+)\/subagents\//);
    parentId = parentDirMatch?.[1] ?? null;
  }

  const meta: SessionMeta = {
    id,
    agent: "claude",
    subagent: isAgentSubfile,
    parentId,
    forkedFrom: null,
    cwd: null,
    filePath,
    harnessErrors: [],
    compactions: 0,
    subagentRefs: [],
  };

  const events: TranscriptEvent[] = [];
  const toolMap = new Map<string, TrackedToolCall>();

  for (const obj of readJsonlRecords(filePath)) {
    const sid = asString(obj.sessionId);
    if (sid && !isAgentSubfile) {
      id = sid;
      meta.id = sid;
    }
    const objCwd = asString(obj.cwd) ?? null;
    if (objCwd && !meta.cwd) meta.cwd = objCwd;
    if (obj.isSidechain === true) meta.subagent = true;

    const kind = asString(obj.type) ?? "";
    const ts = parseTs(obj.timestamp);
    const branch = sanitizeGitBranch(asString(obj.gitBranch)) ?? null;

    if (kind === "system" && asString(obj.subtype) === "compact_boundary") {
      meta.compactions = (meta.compactions ?? 0) + 1;
      events.push({
        ts,
        role: "tool",
        text: "Conversation compacted",
        tools: "compact_boundary",
        ntools: 0,
        exit: null,
        branch,
        cwd: objCwd ?? meta.cwd,
        isCompaction: true,
      });
      continue;
    }

    if (obj.isApiErrorMessage === true || kind === "error") {
      const errMsg = stripAnsi(textOf(obj.message) || textOf(obj.error) || "Claude API error");
      meta.harnessErrors?.push({ ts: ts ? ts.toISOString() : null, step: null, message: truncate(errMsg, 400) });
      events.push({
        ts,
        role: "tool",
        text: truncate(errMsg, 600),
        tools: "harness_error",
        ntools: 0,
        exit: 1,
        branch,
        cwd: objCwd ?? meta.cwd,
        isError: true,
      });
      continue;
    }

    if (kind === "assistant") {
      const ev = handleClaudeAssistant(obj, ts, objCwd ?? meta.cwd ?? null, branch, toolMap);
      if (ev) events.push(ev);
    } else if (kind === "user") {
      for (const ev of handleClaudeUser(obj, ts, objCwd ?? meta.cwd ?? null, branch, toolMap)) {
        events.push(ev);
      }
    }
  }

  return [meta, events];
}

function unwrapCodexOutput(rawOutput: string): { text: string; exit: number | null } {
  const trimmed = rawOutput.trim();
  const parsed = trimmed.startsWith("{") ? safeJsonParse(trimmed) : null;
  if (isRecord(parsed)) {
    const outText = asString(parsed.output) ?? asString(parsed.stdout) ?? rawOutput;
    const meta = isRecord(parsed.metadata) ? parsed.metadata : null;
    const exitCode = asNumber(meta?.exit_code) ?? asNumber(parsed.exit_code) ?? extractExitCode(outText);
    return { text: stripAnsi(outText), exit: exitCode };
  }
  const clean = stripAnsi(rawOutput);
  return { text: clean, exit: extractExitCode(clean) };
}

/** Parse a Codex CLI rollout JSONL file. */
export function adaptCodex(filePath: string): SessionData {
  const idMatch = path.basename(filePath).match(UUID_RE);
  const meta: SessionMeta = {
    id: idMatch?.[0] ?? path.basename(filePath, path.extname(filePath)),
    agent: "codex",
    subagent: false,
    parentId: null,
    forkedFrom: null,
    cwd: null,
    filePath,
    harnessErrors: [],
    compactions: 0,
    subagentRefs: [],
  };

  const records = readJsonlRecords(filePath);
  const hasResponseMessages = records.some(
    (r) =>
      r.type === "response_item" &&
      isRecord(r.payload) &&
      r.payload.type === "message" &&
      r.payload.role === "user",
  );

  const events: TranscriptEvent[] = [];
  const callMap = new Map<string, TrackedToolCall>();
  const recordedExecCallIds = new Set<string>();
  let activeCwd: string | null = null;
  let activeBranch: string | null = null;

  for (const obj of records) {
    const kind = asString(obj.type) ?? "";
    const ts = parseTs(obj.timestamp);
    const payload = isRecord(obj.payload) ? obj.payload : null;

    if (kind === "session_meta" && payload) {
      meta.id = asString(payload.id) ?? meta.id;
      const cwd = asString(payload.cwd) ?? null;
      if (cwd) {
        activeCwd = cwd;
        meta.cwd = cwd;
      }
      meta.forkedFrom = asString(payload.forked_from_id) ?? meta.forkedFrom ?? null;
      const git = isRecord(payload.git) ? payload.git : null;
      const br = sanitizeGitBranch(asString(git?.branch));
      if (br) activeBranch = br;
      const source = asString(payload.source);
      if (source && /subagent/i.test(source)) meta.subagent = true;
      continue;
    }

    if (kind === "turn_context" && payload) {
      const cwd = asString(payload.cwd);
      if (cwd) {
        activeCwd = cwd;
        meta.cwd = meta.cwd ?? cwd;
      }
      const git = isRecord(payload.git) ? payload.git : null;
      const br = sanitizeGitBranch(asString(git?.branch));
      if (br) activeBranch = br;
      continue;
    }

    if (kind === "compacted") {
      meta.compactions = (meta.compactions ?? 0) + 1;
      events.push({
        ts,
        role: "tool",
        text: "Conversation compacted",
        tools: "compacted",
        ntools: 0,
        exit: null,
        branch: activeBranch,
        cwd: activeCwd,
        isCompaction: true,
      });
      continue;
    }

    if (kind === "response_item" && payload) {
      const ptype = asString(payload.type) ?? "";
      if (ptype === "message") {
        const roleRaw = asString(payload.role);
        if (roleRaw !== "user" && roleRaw !== "assistant") continue;
        const text = textOf(payload.content);
        if (text.length === 0 || (roleRaw === "user" && isNoiseEnvelope(text))) continue;
        const cleaned = roleRaw === "user" ? cleanUserText(text) : text;
        if (cleaned.length === 0) continue;
        events.push({
          ts,
          role: roleRaw,
          text: cleaned,
          userPrompt: roleRaw === "user" ? cleaned : undefined,
          tools: "",
          ntools: 0,
          exit: null,
          branch: activeBranch,
          cwd: activeCwd,
        });
      } else if (ptype === "function_call" || ptype === "custom_tool_call" || ptype === "local_shell_call") {
        const name = asString(payload.name) ?? (ptype === "local_shell_call" ? "shell" : "tool");
        const callId = asString(payload.call_id) ?? asString(payload.id);
        const argsObj = parseArgsObject(payload.arguments ?? payload.input ?? payload.action);
        const { command, filePath: targetPath } = extractCommandAndPath(name, argsObj);
        const isRead = FILE_READ_TOOLS.has(name.toLowerCase());
        if (callId) callMap.set(callId, { name, command, filePath: targetPath, isRead });
        const branch = extractBranchFromCommandAndOutput(command, "") ?? activeBranch;
        if (branch && !activeBranch) activeBranch = branch;
        events.push({
          ts,
          role: "assistant",
          text: "",
          tools: summarizeToolInvocation(name, command, targetPath),
          toolNames: [name],
          commands: command ? [command] : [],
          ntools: 1,
          exit: null,
          branch,
          cwd: extractCwdHint(targetPath, command, "") ?? activeCwd,
        });
      } else if (ptype === "function_call_output" || ptype === "custom_tool_call_output") {
        const callId = asString(payload.call_id) ?? "";
        const tracked = callMap.get(callId) ?? null;
        if (callId) recordedExecCallIds.add(callId);
        const unwrapped = unwrapCodexOutput(textOf(payload.output));
        const isRead = Boolean(tracked?.isRead) || isFileReadContent(unwrapped.text);
        const branch = isRead
          ? activeBranch
          : extractBranchFromCommandAndOutput(tracked?.command ?? null, unwrapped.text) ?? activeBranch;
        events.push({
          ts,
          role: "tool",
          text: isRead ? "" : truncate(unwrapped.text, 2000),
          tools: tracked ? tracked.name : "tool_output",
          commands: [],
          resultCommand: tracked?.command ?? null,
          ntools: 0,
          exit: unwrapped.exit,
          branch,
          cwd: extractCwdHint(tracked?.filePath ?? null, tracked?.command ?? null, isRead ? "" : unwrapped.text) ?? activeCwd,
          isError: unwrapped.exit !== null && unwrapped.exit !== 0,
        });
      }
      continue;
    }

    if (kind === "event_msg" && payload) {
      const etype = asString(payload.type) ?? "";
      if (etype === "user_message" && !hasResponseMessages) {
        const raw = asString(payload.message) ?? "";
        const cleaned = cleanUserText(raw);
        if (cleaned.length > 0 && !isNoiseEnvelope(raw)) {
          events.push({
            ts,
            role: "user",
            text: cleaned,
            userPrompt: cleaned,
            tools: "",
            ntools: 0,
            exit: null,
            branch: activeBranch,
            cwd: activeCwd,
          });
        }
      } else if (etype === "agent_message" && !hasResponseMessages) {
        const raw = asString(payload.message) ?? "";
        if (raw.length > 0) {
          events.push({ ts, role: "assistant", text: raw, tools: "", ntools: 0, exit: null, branch: activeBranch, cwd: activeCwd });
        }
      } else if (etype === "exec_command_end") {
        const callId = asString(payload.call_id) ?? "";
        if (callId && recordedExecCallIds.has(callId)) continue;
        const cmd = Array.isArray(payload.command)
          ? payload.command.map((c) => String(c)).join(" ")
          : asString(payload.command) ?? callMap.get(callId)?.command ?? null;
        const exit = asNumber(payload.exit_code) ?? null;
        const out = stripAnsi(asString(payload.aggregated_output) ?? asString(payload.formatted_output) ?? "");
        const branch = extractBranchFromCommandAndOutput(cmd, out) ?? activeBranch;
        events.push({
          ts,
          role: "tool",
          text: truncate(out, 2000),
          tools: cmd ? `exec(${truncate(cmd, 60)})` : "exec_command_end",
          commands: cmd ? [cmd] : [],
          ntools: 1,
          exit,
          branch,
          cwd: asString(payload.cwd) ?? activeCwd,
          isError: exit !== null && exit !== 0,
        });
      } else if (etype === "error") {
        const msg = stripAnsi(asString(payload.message) ?? "Codex harness error");
        meta.harnessErrors?.push({ ts: ts ? ts.toISOString() : null, step: null, message: truncate(msg, 400) });
      }
    }
  }

  return [meta, events];
}

function buildOpenCodeSessionData(
  sessionInfo: Record<string, unknown>,
  filePath: string,
  messagesWithParts: Array<{ info: Record<string, unknown>; parts: Record<string, unknown>[] }>,
): SessionData {
  const id = asString(sessionInfo.id) ?? path.basename(filePath, path.extname(filePath));
  const parentId = asString(sessionInfo.parentID) ?? asString(sessionInfo.parentId) ?? null;
  const dir = asString(sessionInfo.directory) ?? asString(sessionInfo.cwd) ?? null;

  const meta: SessionMeta = {
    id,
    agent: "opencode",
    subagent: parentId !== null,
    parentId,
    forkedFrom: null,
    cwd: dir,
    title: asString(sessionInfo.title) ?? null,
    filePath,
    harnessErrors: [],
    compactions: 0,
    subagentRefs: [],
  };

  const events: TranscriptEvent[] = [];
  for (const { info, parts } of messagesWithParts) {
    const role = asString(info.role) === "user" ? "user" : "assistant";
    const timeObj = isRecord(info.time) ? info.time : null;
    const ts = parseTs(timeObj?.created ?? info.created_at ?? info.timestamp);

    if (isRecord(info.error)) {
      const errMsg = textOf(info.error.data ?? info.error) || asString(info.error.name) || "OpenCode error";
      meta.harnessErrors?.push({ ts: ts ? ts.toISOString() : null, step: null, message: truncate(errMsg, 400) });
    }

    const textParts: string[] = [];
    const toolNames: string[] = [];
    const toolSummaries: string[] = [];
    const commands: string[] = [];
    const toolEvents: TranscriptEvent[] = [];

    for (const part of parts) {
      const ptype = asString(part.type) ?? "";
      if (ptype === "text") {
        const s = asString(part.text) ?? "";
        if (s.length > 0) textParts.push(s);
      } else if (ptype === "compaction") {
        meta.compactions = (meta.compactions ?? 0) + 1;
        toolEvents.push({
          ts,
          role: "tool",
          text: "Conversation compacted",
          tools: "compaction",
          ntools: 0,
          exit: null,
          branch: null,
          cwd: dir,
          isCompaction: true,
        });
      } else if (ptype === "tool") {
        const name = asString(part.tool) ?? "tool";
        const state = isRecord(part.state) ? part.state : null;
        const inputObj = parseArgsObject(state?.input ?? part.input);
        const { command, filePath: targetPath } = extractCommandAndPath(name, inputObj);
        const isRead = FILE_READ_TOOLS.has(name.toLowerCase());
        toolNames.push(name);
        if (command) commands.push(command);
        toolSummaries.push(summarizeToolInvocation(name, command, targetPath));

        const status = asString(state?.status);
        const out = stripAnsi(textOf(state?.output ?? state?.error ?? ""));
        const metaObj = isRecord(state?.metadata) ? state.metadata : null;
        const exit = asNumber(metaObj?.exit) ?? extractExitCode(out) ?? (status === "error" ? 1 : null);
        toolEvents.push({
          ts,
          role: "tool",
          text: isRead ? "" : truncate(out, 2000),
          tools: name,
          commands: [],
          resultCommand: command,
          ntools: 0,
          exit,
          branch: isRead ? null : extractBranchFromCommandAndOutput(command, out),
          cwd: extractCwdHint(targetPath, command, isRead ? "" : out) ?? dir,
          isError: status === "error" || (exit !== null && exit !== 0),
        });
      }
    }

    const joined = textParts.join("\n");
    if (role === "user") {
      const cleaned = cleanUserText(joined);
      if (cleaned.length > 0) {
        events.push({
          ts,
          role: "user",
          text: cleaned,
          userPrompt: cleaned,
          tools: "",
          ntools: 0,
          exit: null,
          branch: null,
          cwd: dir,
        });
      }
    } else if (joined.length > 0 || toolNames.length > 0) {
      events.push({
        ts,
        role: "assistant",
        text: joined,
        tools: toolSummaries.join(", "),
        toolNames,
        commands,
        ntools: toolNames.length,
        exit: null,
        branch: extractBranchFromCommandAndOutput(commands[0] ?? null, ""),
        cwd: dir,
      });
    }
    for (const te of toolEvents) events.push(te);
  }

  return [meta, events];
}

function readJsonRecord(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = safeJsonParse(fs.readFileSync(filePath, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Parse an OpenCode session storage JSON file or `opencode export` JSON file. */
export function adaptOpenCode(filePath: string): SessionData {
  const obj = readJsonRecord(filePath);
  if (!obj) {
    return [{ id: path.basename(filePath, ".json"), agent: "opencode", subagent: false, filePath }, []];
  }

  // Case 1: `opencode export` JSON (`{ info, messages: [{ info, parts }] }`)
  if (isRecord(obj.info) && Array.isArray(obj.messages)) {
    const msgs: Array<{ info: Record<string, unknown>; parts: Record<string, unknown>[] }> = [];
    for (const rawMsg of obj.messages) {
      if (!isRecord(rawMsg) || !isRecord(rawMsg.info)) continue;
      const parts = Array.isArray(rawMsg.parts) ? rawMsg.parts.filter(isRecord) : [];
      msgs.push({ info: rawMsg.info, parts });
    }
    return buildOpenCodeSessionData(obj.info, filePath, msgs);
  }

  // Case 2: OpenCode storage layout (`storage/session/<proj>/<sessionId>.json`)
  const sid = asString(obj.id) ?? path.basename(filePath, ".json");
  const normalized = filePath.replace(/\\/g, "/");
  const storageRootMatch = normalized.match(/^(.*\/storage)\/session\//);
  const storageRoot = storageRootMatch?.[1];
  const msgs: Array<{ info: Record<string, unknown>; parts: Record<string, unknown>[] }> = [];

  if (storageRoot) {
    const msgDir = path.join(storageRoot, "message", sid);
    if (fs.existsSync(msgDir)) {
      const msgFiles = sortedCopy(
        fs.readdirSync(msgDir).filter((f) => f.endsWith(".json")),
        (a, b) => a.localeCompare(b),
      );
      for (const mf of msgFiles) {
        const msgInfo = readJsonRecord(path.join(msgDir, mf));
        if (!msgInfo) continue;
        const mid = asString(msgInfo.id) ?? path.basename(mf, ".json");
        const partDir = path.join(storageRoot, "part", mid);
        const parts: Record<string, unknown>[] = [];
        if (fs.existsSync(partDir)) {
          const partFiles = sortedCopy(
            fs.readdirSync(partDir).filter((f) => f.endsWith(".json")),
            (a, b) => a.localeCompare(b),
          );
          for (const pf of partFiles) {
            const p = readJsonRecord(path.join(partDir, pf));
            if (p) parts.push(p);
          }
        }
        msgs.push({ info: msgInfo, parts });
      }
      const orderedMsgs = sortedCopy(msgs, (a, b) => {
        const ta = isRecord(a.info.time) ? (asNumber(a.info.time.created) ?? 0) : 0;
        const tb = isRecord(b.info.time) ? (asNumber(b.info.time.created) ?? 0) : 0;
        return ta - tb;
      });
      return buildOpenCodeSessionData(obj, filePath, orderedMsgs);
    }
  }

  return buildOpenCodeSessionData(obj, filePath, msgs);
}

async function loadOpenCodeFromSqlite(dbPath: string): Promise<SessionData[]> {
  if (!fs.existsSync(dbPath)) return [];
  try {
    const sqlite = await import("bun:sqlite");
    const db = new sqlite.Database(dbPath, { readonly: true });
    try {
      const sessionsRows = db
        .query("SELECT id, parent_id, directory, title, time_created FROM session")
        .all() as Array<Record<string, unknown>>;
      const messagesRows = db
        .query("SELECT id, session_id, time_created, data FROM message ORDER BY time_created ASC")
        .all() as Array<Record<string, unknown>>;
      const partsRows = db
        .query("SELECT id, message_id, session_id, time_created, data FROM part ORDER BY time_created ASC")
        .all() as Array<Record<string, unknown>>;

      const partsByMsg = new Map<string, Record<string, unknown>[]>();
      for (const pr of partsRows) {
        const mid = asString(pr.message_id);
        const dataStr = asString(pr.data);
        if (!mid || !dataStr) continue;
        const parsed = safeJsonParse(dataStr);
        if (!isRecord(parsed)) continue;
        const list = partsByMsg.get(mid) ?? [];
        list.push(parsed);
        partsByMsg.set(mid, list);
      }

      const msgsBySession = new Map<
        string,
        Array<{ info: Record<string, unknown>; parts: Record<string, unknown>[] }>
      >();
      for (const mr of messagesRows) {
        const mid = asString(mr.id);
        const sid = asString(mr.session_id);
        const dataStr = asString(mr.data);
        if (!mid || !sid || !dataStr) continue;
        const parsed = safeJsonParse(dataStr);
        if (!isRecord(parsed)) continue;
        const list = msgsBySession.get(sid) ?? [];
        list.push({ info: parsed, parts: partsByMsg.get(mid) ?? [] });
        msgsBySession.set(sid, list);
      }

      const results: SessionData[] = [];
      for (const sr of sessionsRows) {
        const sid = asString(sr.id);
        if (!sid) continue;
        const info: Record<string, unknown> = {
          id: sid,
          parentID: asString(sr.parent_id) ?? null,
          directory: asString(sr.directory) ?? null,
          title: asString(sr.title) ?? null,
          time: { created: asNumber(sr.time_created) ?? 0 },
        };
        results.push(buildOpenCodeSessionData(info, dbPath, msgsBySession.get(sid) ?? []));
      }
      return results;
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

/** Parse a generic JSONL or JSON transcript into normalized session data. */
export function adaptGeneric(filePath: string): SessionData {
  const id = path.basename(filePath, path.extname(filePath));
  const meta: SessionMeta = {
    id,
    agent: "generic",
    subagent: false,
    parentId: null,
    forkedFrom: null,
    filePath,
    harnessErrors: [],
    compactions: 0,
    subagentRefs: [],
  };

  let items: Record<string, unknown>[] = [];
  const raw = (() => {
    try {
      return fs.readFileSync(filePath, "utf8").trim();
    } catch {
      return "";
    }
  })();

  if (raw.startsWith("[")) {
    const parsed = safeJsonParse(raw);
    if (Array.isArray(parsed)) items = parsed.filter(isRecord);
  } else if (raw.startsWith("{") && !raw.includes("\n")) {
    const parsed = safeJsonParse(raw);
    if (isRecord(parsed)) {
      meta.id = asString(parsed.id) ?? asString(parsed.session_id) ?? id;
      meta.cwd = asString(parsed.cwd) ?? null;
      const arr = parsed.messages ?? parsed.events ?? parsed.turns;
      if (Array.isArray(arr)) items = arr.filter(isRecord);
    }
  } else {
    items = readJsonlRecords(filePath);
  }

  const events: TranscriptEvent[] = [];
  for (const obj of items) {
    if (!meta.cwd && asString(obj.cwd)) meta.cwd = asString(obj.cwd) ?? null;
    if (asString(obj.session_id)) meta.id = asString(obj.session_id) ?? meta.id;

    const rawRole = (asString(obj.role) ?? asString(obj.sender) ?? asString(obj.type) ?? "").toLowerCase();
    const role: Role =
      rawRole === "user" || rawRole === "human" || rawRole === "user_input"
        ? "user"
        : rawRole === "tool" || rawRole === "tool_result" || rawRole === "system" || rawRole === "error"
          ? "tool"
          : "assistant";
    const ts = parseTs(obj.timestamp ?? obj.created_at ?? obj.ts ?? obj.createdAt);
    const content = stripAnsi(textOf(obj.content ?? obj.text ?? obj.message ?? obj.output));
    const exit = asNumber(obj.exit) ?? asNumber(obj.exit_code) ?? asNumber(obj.exitCode) ?? extractExitCode(content);
    const command = asString(obj.command) ?? null;
    const isErr = rawRole === "error" || (exit !== null && exit !== 0);

    if (role === "user") {
      const cleaned = cleanUserText(content);
      if (cleaned.length > 0) {
        events.push({
          ts,
          role: "user",
          text: cleaned,
          userPrompt: cleaned,
          tools: "",
          ntools: 0,
          exit: null,
          branch: asString(obj.branch) ?? null,
          cwd: asString(obj.cwd) ?? meta.cwd ?? null,
        });
      }
      continue;
    }

    const toolCalls = Array.isArray(obj.tool_calls) ? obj.tool_calls : [];
    const commands = command ? [command] : [];
    const toolNames: string[] = [];
    for (const tc of toolCalls) {
      if (!isRecord(tc)) continue;
      const name = asString(tc.name) ?? "tool";
      const parsedArgs = parseArgsObject(tc.args ?? tc.arguments);
      const { command: c } = extractCommandAndPath(name, parsedArgs);
      toolNames.push(name);
      if (c) commands.push(c);
    }

    events.push({
      ts,
      role,
      text: isFileReadContent(content) ? "" : truncate(content, 2000),
      tools: toolNames.join(", "),
      toolNames,
      commands,
      ntools: toolCalls.length,
      exit,
      branch: sanitizeGitBranch(asString(obj.branch)) ?? extractBranchFromCommandAndOutput(commands[0] ?? null, content),
      cwd: asString(obj.cwd) ?? meta.cwd ?? null,
      isError: isErr,
    });
  }

  return [meta, events];
}

/** Adapter registry mapping specific agent names to parsers and default log locations. */
export const ADAPTERS: Record<
  SpecificAgentName,
  { adapt: (filePath: string) => SessionData; defaultGlob: string }
> = {
  antigravity: {
    adapt: adaptAntigravity,
    defaultGlob: "~/.gemini/antigravity/brain/*/.system_generated/logs/transcript_full.jsonl",
  },
  claude: {
    adapt: adaptClaude,
    defaultGlob: "~/.claude/projects/**/*.jsonl",
  },
  codex: {
    adapt: adaptCodex,
    defaultGlob: "~/.codex/sessions/**/*.jsonl",
  },
  opencode: {
    adapt: adaptOpenCode,
    defaultGlob: "~/.local/share/opencode/storage/session/*/*.json",
  },
  generic: {
    adapt: adaptGeneric,
    defaultGlob: "",
  },
};

function sniffAgentFormat(filePath: string): SpecificAgentName {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".db")) return "opencode";
  if (normalized.includes("/antigravity/brain/")) return "antigravity";
  if (normalized.includes("/.claude/projects/")) return "claude";
  if (normalized.includes("/.codex/sessions/") || normalized.includes("/.codex/archived_sessions/")) return "codex";
  if (normalized.includes("/opencode/storage/session/")) return "opencode";

  let sample = "";
  try {
    sample = fs.readFileSync(filePath, "utf8").slice(0, 8192).trim();
  } catch {
    return "generic";
  }

  if (sample.startsWith("{") && !sample.includes("\n")) {
    const parsed = safeJsonParse(sample);
    if (isRecord(parsed)) {
      if (isRecord(parsed.info) && Array.isArray(parsed.messages)) return "opencode";
      if (parsed.projectID !== undefined && parsed.directory !== undefined) return "opencode";
    }
  }

  for (const line of sample.split("\n").slice(0, 10)) {
    const obj = safeJsonParse(line);
    if (!isRecord(obj)) continue;
    if (
      obj.step_index !== undefined &&
      ["USER_INPUT", "PLANNER_RESPONSE", "GENERIC", "SYSTEM_MESSAGE", "CHECKPOINT", "ERROR_MESSAGE"].includes(
        asString(obj.type) ?? "",
      )
    ) {
      return "antigravity";
    }
    if (["session_meta", "response_item", "event_msg", "turn_context", "compacted"].includes(asString(obj.type) ?? "")) {
      return "codex";
    }
    if (obj.sessionId !== undefined && ["user", "assistant", "system", "progress"].includes(asString(obj.type) ?? "")) {
      return "claude";
    }
    if (obj.projectID !== undefined && obj.directory !== undefined) {
      return "opencode";
    }
  }
  return "generic";
}

function globToRegex(pattern: string): RegExp {
  const norm = pattern.replace(/\\/g, "/");
  let re = "^";
  let i = 0;
  while (i < norm.length) {
    if (norm[i] === "*" && norm[i + 1] === "*" && norm[i + 2] === "/") {
      re += "(?:.+/)?";
      i += 3;
    } else if (norm[i] === "*" && norm[i + 1] === "*") {
      re += ".*";
      i += 2;
    } else if (norm[i] === "*") {
      re += "[^/]*";
      i += 1;
    } else if (norm[i] === "?") {
      re += "[^/]";
      i += 1;
    } else {
      const ch = norm[i] ?? "";
      re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  re += "$";
  return new RegExp(re);
}

function expandHome(inputPath: string, homeDir: string): string {
  if (inputPath === "~") return homeDir;
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(homeDir, inputPath.slice(2));
  }
  return inputPath;
}

function walkFiles(dirPath: string, predicate?: (fullPath: string) => boolean): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dirPath)) return out;
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name === ".git" || ent.name === "node_modules") continue;
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile() && (!predicate || predicate(full))) {
        out.push(full);
      }
    }
  }
  return out;
}

function expandInputPath(pattern: string, homeDir: string): string[] {
  const expanded = path.resolve(expandHome(pattern, homeDir));
  if (!expanded.includes("*") && !expanded.includes("?")) {
    if (!fs.existsSync(expanded)) return [];
    try {
      const stat = fs.statSync(expanded);
      if (stat.isFile()) return [expanded];
      if (stat.isDirectory()) {
        return walkFiles(
          expanded,
          (f) => f.endsWith(".jsonl") || f.endsWith(".json") || f.endsWith(".db"),
        );
      }
    } catch {
      return [];
    }
    return [];
  }

  const parts = expanded.replace(/\\/g, "/").split("/");
  const prefixParts: string[] = [];
  for (const part of parts) {
    if (part.includes("*") || part.includes("?")) break;
    prefixParts.push(part);
  }
  const baseDir = prefixParts.length === 0 ? "/" : prefixParts.join("/") || "/";
  if (!fs.existsSync(baseDir)) return [];
  const regex = globToRegex(expanded.replace(/\\/g, "/"));
  return walkFiles(baseDir, (full) => regex.test(full.replace(/\\/g, "/")));
}

function discoverAntigravityFiles(homeDir: string): string[] {
  const brainDir = path.join(homeDir, ".gemini", "antigravity", "brain");
  if (!fs.existsSync(brainDir)) return [];
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(brainDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const logsDir = path.join(brainDir, ent.name, ".system_generated", "logs");
    const fullPath = path.join(logsDir, "transcript_full.jsonl");
    const compactPath = path.join(logsDir, "transcript.jsonl");
    if (fs.existsSync(fullPath)) out.push(fullPath);
    else if (fs.existsSync(compactPath)) out.push(compactPath);
  }
  return out;
}

async function discoverAndLoadSessions(
  agent: AgentName,
  explicitLogs: string[],
  opts?: DiscoveryOptions,
): Promise<SessionData[]> {
  const homeDir = opts?.homeDir ?? os.homedir();
  const env = opts?.env ?? process.env;
  const loaded: SessionData[] = [];
  const seenOpenCodeIds = new Set<string>();

  if (explicitLogs.length > 0) {
    const paths: string[] = [];
    for (const rawPattern of explicitLogs) {
      for (const found of expandInputPath(rawPattern, homeDir)) paths.push(found);
    }
    const dedupPaths = Array.from(new Set(paths));
    const dbPaths: string[] = [];
    for (const p of dedupPaths) {
      const detected = agent === "auto" ? sniffAgentFormat(p) : agent;
      if (detected === "opencode" && p.endsWith(".db")) {
        dbPaths.push(p);
      } else {
        const s = ADAPTERS[detected].adapt(p);
        if (detected === "opencode") seenOpenCodeIds.add(s[0].id);
        loaded.push(s);
      }
    }
    const dbBatches = await Promise.all(dbPaths.map((p) => loadOpenCodeFromSqlite(p)));
    for (const batch of dbBatches) {
      for (const s of batch) {
        if (!seenOpenCodeIds.has(s[0].id)) {
          seenOpenCodeIds.add(s[0].id);
          loaded.push(s);
        }
      }
    }
    return loaded;
  }

  const targets: readonly SpecificAgentName[] =
    agent === "auto" ? ["antigravity", "claude", "codex", "opencode"] : [agent];

  let openCodeDirToLoad: string | null = null;
  for (const target of targets) {
    if (target === "antigravity") {
      for (const p of discoverAntigravityFiles(homeDir)) loaded.push(adaptAntigravity(p));
    } else if (target === "claude") {
      for (const p of expandInputPath("~/.claude/projects/**/*.jsonl", homeDir)) loaded.push(adaptClaude(p));
    } else if (target === "codex") {
      const files = [
        ...expandInputPath("~/.codex/sessions/**/*.jsonl", homeDir),
        ...expandInputPath("~/.codex/archived_sessions/**/*.jsonl", homeDir),
      ];
      for (const p of new Set(files)) loaded.push(adaptCodex(p));
    } else if (target === "opencode") {
      const xdgData = env.XDG_DATA_HOME ?? path.join(homeDir, ".local", "share");
      openCodeDirToLoad = path.join(xdgData, "opencode");
    }
  }

  if (openCodeDirToLoad) {
    const dbPath = path.join(openCodeDirToLoad, "opencode.db");
    for (const s of await loadOpenCodeFromSqlite(dbPath)) {
      seenOpenCodeIds.add(s[0].id);
      loaded.push(s);
    }
    const storageSessions = expandInputPath(path.join(openCodeDirToLoad, "storage", "session", "*", "*.json"), homeDir);
    for (const p of storageSessions) {
      const s = adaptOpenCode(p);
      if (!seenOpenCodeIds.has(s[0].id)) {
        seenOpenCodeIds.add(s[0].id);
        loaded.push(s);
      }
    }
  }

  return loaded;
}

function runGit(args: string[], cwd: string): string {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 4000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return res.status === 0 ? res.stdout.trim() : "";
}

/** Load pull requests from an explicit JSON file or `gh pr list`. */
export function loadPrs(filePath?: string | null, cwd?: string, noGh = false): PullRequest[] {
  if (filePath) {
    try {
      const parsed = safeJsonParse(fs.readFileSync(filePath, "utf8"));
      return Array.isArray(parsed) ? (parsed as PullRequest[]) : [];
    } catch {
      return [];
    }
  }
  if (noGh) return [];
  const res = spawnSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "500",
      "--json",
      "number,title,headRefName,createdAt,mergedAt,closedAt",
    ],
    {
      cwd: cwd ?? process.cwd(),
      encoding: "utf8",
      timeout: 4000,
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (res.status !== 0 || !res.stdout) return [];
  const parsed = safeJsonParse(res.stdout);
  return Array.isArray(parsed) ? (parsed as PullRequest[]) : [];
}

/** Return local and origin remote branch names in `cwd`. */
export function loadGitBranches(cwd?: string): string[] {
  const dir = cwd ?? process.cwd();
  const raw = runGit(["branch", "-a", "--format=%(refname:short)"], dir);
  if (!raw) return [];
  const names = new Set<string>();
  for (const line of raw.split("\n")) {
    const clean = line.trim().replace(/^origin\//, "");
    if (clean.length > 0 && !DEFAULT_BRANCHES.has(clean)) names.add(clean);
  }
  return Array.from(names);
}

function parseRepoSlug(remoteUrl: string): string | null {
  const m = remoteUrl.match(/[:/]([^/:\s]+\/[^/:\s]+?)(?:\.git)?$/);
  return m?.[1] ?? null;
}

/** Resolve git repository context (`root`, `name`, `slug`, `branches`, `prs`). */
export function loadRepoContext(
  explicitRepo?: string | null,
  prsJson?: string | null,
  explicitPrs?: PullRequest[],
  noGh = false,
): RepoContext {
  const targetDir = explicitRepo ? path.resolve(explicitRepo) : process.cwd();
  const top = runGit(["rev-parse", "--show-toplevel"], targetDir);
  const root = path.resolve(top || targetDir);
  const name = path.basename(root);
  const remote = runGit(["remote", "get-url", "origin"], root);
  const slug = parseRepoSlug(remote);
  const branches = new Set(loadGitBranches(root));
  const prs = explicitPrs ?? loadPrs(prsJson, root, noGh);
  for (const pr of prs) {
    if (pr.headRefName && !DEFAULT_BRANCHES.has(pr.headRefName)) {
      branches.add(pr.headRefName);
    }
  }
  return { root, name, slug, branches, prs };
}

function isSameOrChildPath(candidatePath: string, repoRoot: string): boolean {
  const normCandidate = path.resolve(candidatePath);
  const normRoot = path.resolve(repoRoot);
  return normCandidate === normRoot || normCandidate.startsWith(`${normRoot}${path.sep}`);
}

/** Check whether a session belongs to the active repository. */
export function sessionMatchesRepo(meta: SessionMeta, events: TranscriptEvent[], repo: RepoContext): boolean {
  if (meta.cwd && isSameOrChildPath(meta.cwd, repo.root)) return true;

  const escapedRoot = repo.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rootRe = new RegExp(`${escapedRoot}(?:/|\\s|"|'|$)`);
  const slugLower = repo.slug?.toLowerCase() ?? null;
  const dirSegmentRe = new RegExp(
    `(?:^|[\\s"'])/(?:[^\\s"']+/)*${repo.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|\\s|"|'|$)`,
  );

  for (const ev of events) {
    if (ev.cwd && isSameOrChildPath(ev.cwd, repo.root)) return true;
    if (ev.branch && repo.branches.has(ev.branch)) return true;
    const cmdText = (ev.commands ?? []).join("\n");
    const checkText = `${cmdText}\n${ev.text}\n${ev.userPrompt ?? ""}`;
    if (rootRe.test(checkText)) return true;
    if (slugLower && checkText.toLowerCase().includes(slugLower)) return true;
    if (dirSegmentRe.test(cmdText)) return true;
  }
  return false;
}

function sessionBounds(events: TranscriptEvent[]): { first: Date | null; last: Date | null } {
  let first: Date | null = null;
  let last: Date | null = null;
  for (const ev of events) {
    if (!ev.ts) continue;
    if (!first || ev.ts < first) first = ev.ts;
    if (!last || ev.ts > last) last = ev.ts;
  }
  return { first, last };
}

function isPrTemporallyCompatible(pr: PullRequest, firstTs: Date | null, lastTs: Date | null): boolean {
  const twoDaysMs = 48 * 3600 * 1000;
  const fourteenDaysMs = 14 * 24 * 3600 * 1000;
  const created = parseTs(pr.createdAt);
  if (created && lastTs && lastTs.getTime() < created.getTime() - twoDaysMs) {
    return false;
  }
  const ended = parseTs(pr.mergedAt ?? pr.closedAt);
  if (ended && firstTs && firstTs.getTime() > ended.getTime() + fourteenDaysMs) {
    return false;
  }
  return true;
}

function sanitizeCommitLogLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (/^[0-9a-f]{7,40}\s/.test(trimmed)) return false;
      if (/^\|?\s*[0-9a-f]{7,}\s*\|/.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

function findMatchingPr(
  prNum: number,
  prs: PullRequest[],
  explicit: boolean,
  firstTs: Date | null,
  lastTs: Date | null,
): string | null {
  const pr = prs.find((p) => p.number === prNum);
  if (!pr) return null;
  if (!explicit && !isPrTemporallyCompatible(pr, firstTs, lastTs)) return null;
  return pr.headRefName || `PR #${pr.number}`;
}

/** Score branch and PR association keys for a session's events. */
export function keysFor(
  events: TranscriptEvent[],
  prs: PullRequest[],
  gitBranches: string[] = [],
): Map<string, number> {
  const counts = new Map<string, number>();
  const { first: firstTs, last: lastTs } = sessionBounds(events);
  const addWeight = (key: string, weight: number): void => {
    if (!key || DEFAULT_BRANCHES.has(key)) return;
    counts.set(key, (counts.get(key) ?? 0) + weight);
  };

  const knownBranches = Array.from(
    new Set([
      ...gitBranches.filter((b) => b.length >= 4 && !DEFAULT_BRANCHES.has(b)),
      ...prs.map((p) => p.headRefName).filter((b) => b && b.length >= 4 && !DEFAULT_BRANCHES.has(b)),
    ]),
  );

  for (const ev of events) {
    if (ev.branch && !DEFAULT_BRANCHES.has(ev.branch)) {
      addWeight(ev.branch, 20);
    }

    const commandText = (ev.commands ?? []).join("\n");
    if (commandText.length > 0) {
      const ghPrCmdRe = /\bgh\s+pr\s+(?:view|checks|merge|edit|comment|diff|close|reopen|review)\s+(\d+)\b/g;
      for (const m of commandText.matchAll(ghPrCmdRe)) {
        const num = Number(m[1]);
        const key = findMatchingPr(num, prs, true, firstTs, lastTs);
        if (key) addWeight(key, 10);
      }
      for (const br of knownBranches) {
        if (commandText.includes(br)) addWeight(br, 10);
      }
    }

    const searchable = sanitizeCommitLogLines(`${ev.userPrompt ?? ""}\n${ev.text}`);
    const explicitPrRe = /(?:github\.com\/[^\s]+\/pull\/|\/pull\/|\bPR[ \t]*#)(\d+)\b/gi;
    for (const m of searchable.matchAll(explicitPrRe)) {
      const num = Number(m[1]);
      const key = findMatchingPr(num, prs, true, firstTs, lastTs);
      if (key) addWeight(key, 8);
    }

    const weakHashRe = /(?:^|[\s([`"'])#(\d{1,5})(?![0-9a-fL])\b/gm;
    for (const m of searchable.matchAll(weakHashRe)) {
      const num = Number(m[1]);
      if (num <= 0) continue;
      const key = findMatchingPr(num, prs, false, firstTs, lastTs);
      if (key) addWeight(key, 1);
    }
  }

  return counts;
}

/** Pick the representative human-readable topic for a group on `branch`. */
export function chooseGroupTopic(
  members: Array<Pick<LiveSessionInfo, "first_prompt" | "turns" | "errors">>,
  branch: string,
  prs: PullRequest[],
): string {
  const pr = prs.find((p) => p.headRefName === branch || `PR #${p.number}` === branch);
  if (pr?.title && pr.title.trim().length > 0) return truncate(pr.title.trim(), 96);

  const ranked = sortedCopy(members, (a, b) => b.turns - a.turns || b.errors - a.errors);
  const firstPrompt = ranked[0]?.first_prompt ?? "";
  if (firstPrompt.length > 0) return truncate(firstPrompt, 96);
  if (branch !== "unassigned") return branch.replace(/^\d+-/, "").replace(/-/g, " ");
  return "Miscellaneous";
}

function pickPrimaryKey(keys: Map<string, number>): string {
  const entries = sortedCopy(Array.from(keys.entries()), (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0]?.[0] ?? "unassigned";
}

/** Build a `ClusterPlanEntry` from clustered session members. */
export function entry(
  members: Array<
    Pick<LiveSessionInfo, "id" | "agent" | "turns" | "errors" | "first_prompt" | "first_ts" | "keys">
  >,
  branch: string,
  topic: string,
  groupId: number | null = null,
): ClusterPlanEntry {
  const ordered = sortedCopy(members, (a, b) => {
    const ta = a.first_ts ? a.first_ts.getTime() : 0;
    const tb = b.first_ts ? b.first_ts.getTime() : 0;
    return ta - tb;
  });
  const totalTurns = ordered.reduce((sum, m) => sum + m.turns, 0);
  const totalErrors = ordered.reduce((sum, m) => sum + m.errors, 0);
  const agents = Array.from(new Set(ordered.map((m) => m.agent)));
  const branches = Array.from(
    new Set(
      ordered
        .flatMap((m) => Array.from(m.keys.keys()))
        .filter((k) => !DEFAULT_BRANCHES.has(k)),
    ),
  );
  const firstPrompt = ordered.find((m) => m.first_prompt.length > 0)?.first_prompt ?? "(no prompt)";

  return {
    group_id: groupId,
    topic,
    branch_or_pr: branch,
    conversation_ids: ordered.map((m) => m.id),
    turn_count: totalTurns,
    summary: firstPrompt,
    agents,
    branches,
    warnings: totalErrors,
  };
}

function isRetroSession(meta: SessionMeta, events: TranscriptEvent[]): boolean {
  if (meta.subagent) return false;
  const firstUser = events.find((e) => e.role === "user");
  const firstPrompt = firstUser?.userPrompt ?? firstUser?.text ?? "";
  if (/^\/retro(?:\s|$)/i.test(firstPrompt.trim())) return true;
  if (/\b(?:conduct|run)\s+(?:a\s+)?retrospective\b/i.test(firstPrompt)) return true;
  if (/\ball retros\b.*\bretro skill\b/i.test(firstPrompt)) return true;
  if (/\bimprove the retro skill\b/i.test(firstPrompt)) return true;
  return false;
}

function isSubstantiveSession(turns: number, errors: number, toolCalls: number, firstPrompt: string): boolean {
  if (turns >= 2 || errors > 0 || toolCalls >= 3) return true;
  if (turns === 1) {
    const trimmed = firstPrompt.trim();
    if (trimmed.length >= 20) return true;
    if (trimmed.startsWith("/") || trimmed.includes("?") || trimmed.includes("!")) return true;
  }
  return false;
}

function extractExecutedChecks(events: TranscriptEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const bump = (key: string): void => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const ev of events) {
    for (const cmd of ev.commands ?? []) {
      if (/\blint:agents\b/.test(cmd)) bump("lint:agents");
      if (/\blint:workflows\b/.test(cmd)) bump("lint:workflows");
      if (/\boxlint\b|\bbun run lint\b|\bbun run check\b/.test(cmd)) bump("lint");
      if (/\btsc\b|\btypecheck\b/.test(cmd)) bump("typecheck");
      if (/\bbun test\b|\bbun run test\b/.test(cmd)) bump("test");
      if (/\bverify(?::diff-cov|-diff-coverage)\b/.test(cmd)) bump("verify:diff-cov");
      if (/\bfallow\b/.test(cmd)) bump("fallow");
      if (/\bprettier\b/.test(cmd)) bump("prettier");
      if (/\bgit commit\b/.test(cmd)) bump("git_commit");
      if (/\bgh pr\b/.test(cmd)) bump("gh_pr");
      if (/\bgh issue\b/.test(cmd)) bump("gh_issue");
      if (/\bgh stack\b/.test(cmd)) bump("gh_stack");
    }
  }
  return counts;
}

function analyzeFrictionSignals(
  meta: SessionMeta,
  events: TranscriptEvent[],
  failures: FailureEntry[],
): FrictionSignals {
  let pollingCalls = 0;
  let interactiveCalls = 0;
  const hookBypasses: Array<{ command: string; flag: string }> = [];
  const failedCommandCounts = new Map<string, number>();

  for (const ev of events) {
    if (ev.role === "assistant") {
      const toolsText = ev.tools;
      if (/\bmanage_task\b/i.test(toolsText) || /\bmanage_subagents\b/i.test(toolsText)) {
        pollingCalls += 1;
      }
      if (/\bask_question\b/i.test(toolsText)) {
        interactiveCalls += 1;
      }
    }
    for (const cmd of ev.commands ?? []) {
      if (/\b(?:while|until|for)\b[^\n]*\bsleep\b/i.test(cmd)) {
        pollingCalls += 1;
      }
      const noVerify = cmd.match(/\bgit\s+(?:commit|push|merge|rebase)\b[^\n]*?(--no-verify|\s-n(?:\s|$))/);
      if (noVerify?.[1]) {
        hookBypasses.push({ command: truncate(cmd.replace(/\s+/g, " "), 140), flag: noVerify[1].trim() });
      } else if (/\b(?:LEFTHOOK|HUSKY)=0\b/.test(cmd)) {
        hookBypasses.push({ command: truncate(cmd.replace(/\s+/g, " "), 140), flag: "HOOK_ENV=0" });
      }
    }
  }

  for (const f of failures) {
    if (f.command) {
      const normalizedCmd = f.command.replace(/\s+/g, " ").trim();
      failedCommandCounts.set(normalizedCmd, (failedCommandCounts.get(normalizedCmd) ?? 0) + 1);
    }
  }
  let repeatedFailures = 0;
  for (const count of failedCommandCounts.values()) {
    if (count >= 2) repeatedFailures += count - 1;
  }

  return {
    polling_calls: pollingCalls,
    hook_bypasses: hookBypasses,
    interactive_calls: interactiveCalls,
    repeated_failures: repeatedFailures,
    compactions: meta.compactions ?? 0,
    harness_errors: meta.harnessErrors?.length ?? 0,
  };
}

function buildSessionDigest(
  info: LiveSessionInfo,
  subagentMap: Map<string, LiveSessionInfo>,
): SessionDigest {
  const userTurns: UserTurnEntry[] = [];
  const failures: FailureEntry[] = [];
  const branches: string[] = [];
  let cwd: string | null = info.meta.cwd ?? null;

  let turnIdx = 0;
  for (const ev of info.events) {
    if (ev.cwd && !cwd) cwd = ev.cwd;
    if (ev.branch && !DEFAULT_BRANCHES.has(ev.branch) && !branches.includes(ev.branch)) {
      branches.push(ev.branch);
    }
    if (ev.role === "user") {
      turnIdx += 1;
      const text = ev.userPrompt ?? ev.text;
      userTurns.push({
        index: turnIdx,
        step: ev.step ?? null,
        ts: ev.ts ? ev.ts.toISOString() : null,
        text: truncate(text, 800),
        looks_like_correction: looksLikeCorrection(text, turnIdx),
      });
    } else if (ev.isError || (ev.exit !== null && ev.exit !== 0)) {
      failures.push({
        step: ev.step ?? null,
        ts: ev.ts ? ev.ts.toISOString() : null,
        tool: ev.tools || "command",
        command: ev.resultCommand ?? ev.commands?.[0] ?? null,
        exit: ev.exit,
        snippet: truncate(ev.text.replace(/\s+/g, " ").trim(), 280),
      });
    }
  }

  const childIds = new Set<string>(info.meta.subagentRefs ?? []);
  for (const child of subagentMap.values()) {
    if (child.meta.parentId === info.id) childIds.add(child.id);
  }
  const subagentChildren: SubagentSummary[] = [];
  for (const cid of childIds) {
    const child = subagentMap.get(cid);
    if (!child) continue;
    subagentChildren.push({
      id: child.id,
      turns: child.turns,
      errors: child.errors,
      tool_calls: child.tool_calls,
      summary: child.first_prompt || "(subagent)",
    });
  }

  const primaryBranch = pickPrimaryKey(info.keys);
  return {
    id: info.id,
    agent: info.agent,
    started_at: info.first_ts ? info.first_ts.toISOString() : null,
    ended_at: info.last_ts ? info.last_ts.toISOString() : null,
    branch: primaryBranch !== "unassigned" ? primaryBranch : (branches[0] ?? null),
    branches: Array.from(new Set([...branches, ...Array.from(info.keys.keys())])),
    cwd,
    forked_from: info.meta.forkedFrom ?? null,
    parent_id: info.meta.parentId ?? null,
    subagent: info.subagent,
    subagent_children: subagentChildren,
    user_turns: userTurns,
    failures,
    harness_errors: info.meta.harnessErrors ?? [],
    friction_signals: analyzeFrictionSignals(info.meta, info.events, failures),
    executed_checks: extractExecutedChecks(info.events),
    turns: info.turns,
    errors: info.errors,
    tool_calls: info.tool_calls,
  };
}

/** Cluster filtered sessions by branch or PR association. */
export function cluster(
  sessions: SessionData[],
  since: Date,
  until: Date,
  prs: PullRequest[],
  repo?: RepoContext,
  options?: {
    includeSubagents?: boolean;
    includeRetro?: boolean;
    includeTrivial?: boolean;
    allRepos?: boolean;
    sessionFilter?: string[];
    branchFilter?: string;
    prFilter?: number;
    queryFilter?: string;
  },
): ClusterPlanEntry[] {
  const { live } = collectLiveSessions(sessions, since, until, prs, repo, options);
  const groups = new Map<string, LiveSessionInfo[]>();
  const unassigned: LiveSessionInfo[] = [];

  for (const item of live) {
    const branch = pickPrimaryKey(item.keys);
    if (branch === "unassigned") {
      unassigned.push(item);
    } else {
      const list = groups.get(branch) ?? [];
      list.push(item);
      groups.set(branch, list);
    }
  }

  const sortedBranches = sortedCopy(Array.from(groups.keys()), (a, b) => {
    const listA = groups.get(a) ?? [];
    const listB = groups.get(b) ?? [];
    const turnsA = listA.reduce((s, m) => s + m.turns, 0);
    const turnsB = listB.reduce((s, m) => s + m.turns, 0);
    return turnsB - turnsA || a.localeCompare(b);
  });

  const result: ClusterPlanEntry[] = [];
  let gid = 1;
  for (const branch of sortedBranches) {
    const members = groups.get(branch) ?? [];
    const topic = chooseGroupTopic(members, branch, prs);
    result.push(entry(members, branch, topic, gid));
    gid += 1;
  }

  const sortedUnassigned = sortedCopy(unassigned, (a, b) => {
    const ta = a.first_ts ? a.first_ts.getTime() : 0;
    const tb = b.first_ts ? b.first_ts.getTime() : 0;
    return ta - tb;
  });
  for (const item of sortedUnassigned) {
    result.push(entry([item], "unassigned", truncate(item.first_prompt || "Miscellaneous", 96), null));
  }

  return result;
}

function collectLiveSessions(
  sessions: SessionData[],
  since: Date,
  until: Date,
  prs: PullRequest[],
  repo?: RepoContext,
  options?: {
    includeSubagents?: boolean;
    includeRetro?: boolean;
    includeTrivial?: boolean;
    allRepos?: boolean;
    sessionFilter?: string[];
    branchFilter?: string;
    prFilter?: number;
    queryFilter?: string;
  },
): { live: LiveSessionInfo[]; allById: Map<string, LiveSessionInfo> } {
  const gitBranches = repo ? Array.from(repo.branches) : [];
  const allById = new Map<string, LiveSessionInfo>();
  const live: LiveSessionInfo[] = [];
  const sessionFilters = options?.sessionFilter ?? [];
  const queryLower = options?.queryFilter?.toLowerCase();
  const branchLower = options?.branchFilter?.toLowerCase();

  for (const [meta, events] of sessions) {
    const { first, last } = sessionBounds(events);
    const userEvents = events.filter((e) => e.role === "user");
    const turns = userEvents.length;
    const firstPrompt = cleanPrompt(userEvents[0]?.userPrompt ?? userEvents[0]?.text ?? meta.title ?? "");
    const errors = events.filter((e) => e.isError || (e.exit !== null && e.exit !== 0)).length;
    const toolCalls = events.reduce((sum, e) => sum + e.ntools, 0);
    const keys = keysFor(events, prs, gitBranches);

    const info: LiveSessionInfo = {
      id: meta.id,
      agent: meta.agent ?? "generic",
      turns,
      errors,
      tool_calls: toolCalls,
      keys,
      first_prompt: firstPrompt,
      first_ts: first,
      last_ts: last,
      subagent: meta.subagent,
      meta,
      events,
    };
    allById.set(info.id, info);

    if (sessionFilters.length > 0) {
      const matchedId = sessionFilters.some((f) => info.id === f || info.id.startsWith(f));
      if (!matchedId) continue;
    }

    if (meta.subagent && !options?.includeSubagents && sessionFilters.length === 0) continue;
    if (!options?.includeRetro && sessionFilters.length === 0 && isRetroSession(meta, events)) continue;

    if (repo && !options?.allRepos && sessionFilters.length === 0 && !sessionMatchesRepo(meta, events, repo)) {
      continue;
    }

    if (first && (first < since || first > until)) continue;
    if (!first && since.getTime() > 0) continue;

    if (!options?.includeTrivial && sessionFilters.length === 0 && !isSubstantiveSession(turns, errors, toolCalls, firstPrompt)) {
      continue;
    }

    if (branchLower) {
      const branchHit = Array.from(keys.keys()).some((k) => k.toLowerCase().includes(branchLower));
      if (!branchHit) continue;
    }

    if (options?.prFilter !== undefined) {
      const targetPr = prs.find((p) => p.number === options.prFilter);
      const prKey = targetPr?.headRefName ?? `PR #${options.prFilter}`;
      const prHit = keys.has(prKey) || keys.has(`PR #${options.prFilter}`);
      if (!prHit) continue;
    }

    if (queryLower) {
      const haystack = [
        info.id,
        firstPrompt,
        ...userEvents.map((e) => e.userPrompt ?? e.text),
        ...Array.from(keys.keys()),
        ...events.flatMap((e) => e.commands ?? []),
      ]
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(queryLower)) continue;
    }

    live.push(info);
  }

  return { live, allById };
}

/** Parse `--since` into start-of-day UTC `Date`. */
export function parseSinceDate(str: string): Date {
  if (CORRUPTION_DATE_RE.test(str)) {
    const d = new Date(`${str}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${str}`);
    return d;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${str}`);
  return d;
}

/** Parse `--until` into end-of-day UTC `Date` (defaults to end of today UTC). */
export function parseUntilDate(str?: string): Date {
  if (!str) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  }
  if (CORRUPTION_DATE_RE.test(str)) {
    const d = new Date(`${str}T23:59:59.999Z`);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${str}`);
    return d;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${str}`);
  return d;
}

function defaultSinceFromDays(days: number): Date {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  start.setUTCDate(start.getUTCDate() - Math.max(0, days));
  return start;
}

function requireFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(formatError(`Missing value for ${flag}`, "Flag expects an argument.", `Pass a value after ${flag}.`));
  }
  return value;
}

function parseCliArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    agent: "auto",
    logs: [],
    days: 7,
    sessions: [],
    inspect: false,
    format: "json",
    allRepos: false,
    includeSubagents: false,
    includeRetro: false,
    includeTrivial: false,
    noGh: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--agent") {
      const val = requireFlagValue(argv, i, arg).toLowerCase();
      i += 1;
      if (val !== "auto" && !SPECIFIC_AGENTS.includes(val as SpecificAgentName)) {
        throw new Error(
          formatError(
            `Unknown --agent "${val}"`,
            `Supported agents: auto, ${SPECIFIC_AGENTS.join(", ")}.`,
            "Use --agent auto or one of the listed agent names.",
          ),
        );
      }
      opts.agent = val as AgentName;
    } else if (arg === "--logs") {
      opts.logs.push(requireFlagValue(argv, i, arg));
      i += 1;
    } else if (arg === "--since") {
      opts.since = requireFlagValue(argv, i, arg);
      i += 1;
    } else if (arg === "--until") {
      opts.until = requireFlagValue(argv, i, arg);
      i += 1;
    } else if (arg === "--days") {
      const num = Number(requireFlagValue(argv, i, arg));
      i += 1;
      if (!Number.isInteger(num) || num < 0) {
        throw new Error(formatError("Invalid --days value", "Expected non-negative integer.", "Pass --days <N>."));
      }
      opts.days = num;
    } else if (arg === "--session") {
      const val = requireFlagValue(argv, i, arg);
      i += 1;
      for (const s of val.split(",").map((x) => x.trim()).filter(Boolean)) {
        opts.sessions.push(s);
      }
    } else if (arg === "--branch") {
      opts.branch = requireFlagValue(argv, i, arg);
      i += 1;
    } else if (arg === "--pr") {
      const num = Number(requireFlagValue(argv, i, arg));
      i += 1;
      if (!Number.isInteger(num) || num <= 0) {
        throw new Error(formatError("Invalid --pr value", "Expected positive PR number.", "Pass --pr <number>."));
      }
      opts.pr = num;
    } else if (arg === "--query") {
      opts.query = requireFlagValue(argv, i, arg);
      i += 1;
    } else if (arg === "--inspect") {
      opts.inspect = true;
    } else if (arg === "--format") {
      const fmt = requireFlagValue(argv, i, arg).toLowerCase();
      i += 1;
      if (fmt !== "json" && fmt !== "md") {
        throw new Error(formatError(`Invalid --format "${fmt}"`, "Only json or md allowed.", "Pass --format json|md."));
      }
      opts.format = fmt;
    } else if (arg === "--prs") {
      opts.prsPath = requireFlagValue(argv, i, arg);
      i += 1;
    } else if (arg === "--repo") {
      opts.repo = requireFlagValue(argv, i, arg);
      i += 1;
    } else if (arg === "--all-repos") {
      opts.allRepos = true;
    } else if (arg === "--include-subagents") {
      opts.includeSubagents = true;
    } else if (arg === "--include-retro") {
      opts.includeRetro = true;
    } else if (arg === "--include-trivial") {
      opts.includeTrivial = true;
    } else if (arg === "--no-gh") {
      opts.noGh = true;
    } else {
      throw new Error(
        formatError(`Unknown option: ${arg}`, "Unrecognized CLI flag.", "Run with --help to inspect valid options."),
      );
    }
  }
  return opts;
}

function formatClustersMd(entries: ClusterPlanEntry[]): string {
  if (entries.length === 0) return "No matching sessions found.\n";
  const lines = [
    "| Group | Branch / PR | Topic | Turns | Warnings | Sessions |",
    "| :--- | :--- | :--- | ---: | ---: | :--- |",
  ];
  for (const e of entries) {
    const gid = e.group_id === null ? "-" : String(e.group_id);
    const ids = e.conversation_ids.map((id) => id.slice(0, 8)).join(", ");
    lines.push(`| ${gid} | ${e.branch_or_pr} | ${e.topic.replace(/\|/g, "\\|")} | ${e.turn_count} | ${e.warnings ?? 0} | ${ids} |`);
  }
  return `${lines.join("\n")}\n`;
}

function formatDigestsMd(digests: SessionDigest[]): string {
  if (digests.length === 0) return "No matching sessions found.\n";
  const chunks: string[] = [];
  for (const d of digests) {
    chunks.push(`## Session ${d.id} (${d.agent})`);
    chunks.push(
      `- Window: ${d.started_at ?? "?"} .. ${d.ended_at ?? "?"} | Branch: ${d.branch ?? "none"} | Turns: ${d.turns} | Errors: ${d.errors} | Tools: ${d.tool_calls}`,
    );
    chunks.push(
      `- Signals: polling=${d.friction_signals.polling_calls}, hook_bypasses=${d.friction_signals.hook_bypasses.length}, interactive=${d.friction_signals.interactive_calls}, repeated_failures=${d.friction_signals.repeated_failures}, compactions=${d.friction_signals.compactions}, harness_errors=${d.friction_signals.harness_errors}`,
    );
    const checks = Object.entries(d.executed_checks)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    if (checks) chunks.push(`- Checks: ${checks}`);
    if (d.forked_from) chunks.push(`- Forked from: ${d.forked_from}`);
    if (d.subagent_children.length > 0) {
      chunks.push(
        `- Subagents (${d.subagent_children.length}): ${d.subagent_children.map((c) => `${c.id.slice(0, 8)}(errs=${c.errors},tools=${c.tool_calls}: ${truncate(c.summary, 60)})`).join("; ")}`,
      );
    }
    if (d.user_turns.length > 0) {
      chunks.push("### User turns");
      for (const t of d.user_turns) {
        const tag = t.looks_like_correction ? " [correction]" : "";
        chunks.push(`${t.index}. (${t.ts ?? "?"})${tag} ${t.text.replace(/\n+/g, " ")}`);
      }
    }
    if (d.failures.length > 0) {
      chunks.push("### Failures");
      for (const f of d.failures.slice(0, 20)) {
        const cmdOneLine = f.command ? truncate(f.command.replace(/\s+/g, " ").trim(), 140) : "-";
        chunks.push(`- exit=${f.exit ?? "err"} tool=${f.tool} cmd=${cmdOneLine} :: ${f.snippet}`);
      }
    }
    if (d.harness_errors.length > 0) {
      chunks.push("### Harness errors");
      for (const h of d.harness_errors) chunks.push(`- (${h.ts ?? "?"}) ${h.message}`);
    }
    chunks.push("");
  }
  return `${chunks.join("\n")}\n`;
}

function usageText(): string {
  return [
    "Usage: cluster.ts [options]",
    "",
    "Discover, inspect, and cluster agent transcripts by branch/PR or filter criteria.",
    "",
    "Options:",
    "  --agent <name>       auto (default), antigravity, claude, codex, opencode, generic",
    "  --logs <path|glob>   Explicit file, directory, or glob (repeatable; overrides discovery)",
    "  --since <date>       Start date YYYY-MM-DD or ISO (default: --days ago, or unbounded with --session)",
    "  --until <date>       End date YYYY-MM-DD or ISO (default: end of today UTC)",
    "  --days <N>           Lookback window in days when --since is omitted (default: 7)",
    "  --session <ids>      Comma-separated or repeatable session IDs / prefixes",
    "  --branch <name>      Filter sessions matching branch substring",
    "  --pr <number>        Filter sessions associated with PR number",
    "  --query <text>       Filter sessions matching text across prompts, commands, and branches",
    "  --inspect            Emit detailed SessionDigest objects (prompts, failures, friction signals)",
    "  --format <json|md>   Output format: json (default) or md",
    "  --prs <path>         Path to pre-fetched PR list JSON",
    "  --repo <path>        Target repository path (default: git top-level or cwd)",
    "  --all-repos          Include sessions across all repositories",
    "  --include-subagents  Include child subagent sessions as standalone entries",
    "  --include-retro      Include retrospective sessions themselves",
    "  --include-trivial    Include single-turn trivial sessions",
    "  --no-gh              Skip querying `gh pr list`",
    "  -h, --help           Show this help message and exit 0",
  ].join("\n");
}

/** CLI entrypoint. Returns exit code `0` on success or `1` on error. */
export async function main(argv: string[] = process.argv.slice(2), discoveryOpts?: DiscoveryOptions): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCliArgs(argv);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  if (opts.help) {
    process.stdout.write(`${usageText()}\n`);
    return 0;
  }

  let since: Date;
  let until: Date;
  try {
    const unboundedForTarget = opts.sessions.length > 0 && !opts.since;
    since = opts.since ? parseSinceDate(opts.since) : unboundedForTarget ? new Date(0) : defaultSinceFromDays(opts.days);
    until = parseUntilDate(opts.until);
  } catch (err) {
    process.stderr.write(
      `${formatError(
        err instanceof Error ? err.message : "Invalid date flag",
        "Date strings must be YYYY-MM-DD or valid ISO-8601 timestamps.",
        "Pass valid dates to --since / --until.",
      )}\n`,
    );
    return 1;
  }

  const repo = loadRepoContext(opts.repo, opts.prsPath, undefined, opts.noGh);
  const sessions = await discoverAndLoadSessions(opts.agent, opts.logs, discoveryOpts);
  const filterOpts = {
    includeSubagents: opts.includeSubagents,
    includeRetro: opts.includeRetro,
    includeTrivial: opts.includeTrivial,
    allRepos: opts.allRepos,
    sessionFilter: opts.sessions,
    branchFilter: opts.branch,
    prFilter: opts.pr,
    queryFilter: opts.query,
  };

  if (opts.inspect) {
    const { live, allById } = collectLiveSessions(sessions, since, until, repo.prs, repo, filterOpts);
    const digests = sortedCopy(live, (a, b) => {
      const ta = a.first_ts ? a.first_ts.getTime() : 0;
      const tb = b.first_ts ? b.first_ts.getTime() : 0;
      return ta - tb;
    }).map((item) => buildSessionDigest(item, allById));

    process.stdout.write(opts.format === "md" ? formatDigestsMd(digests) : `${JSON.stringify(digests, null, 2)}\n`);
    return 0;
  }

  const clustered = cluster(sessions, since, until, repo.prs, repo, filterOpts);
  process.stdout.write(opts.format === "md" ? formatClustersMd(clustered) : `${JSON.stringify(clustered, null, 2)}\n`);
  return 0;
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  process.exit(code);
}
