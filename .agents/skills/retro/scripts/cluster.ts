#!/usr/bin/env bun
/**
 * Cluster agent session transcripts into work-unit groups for /retro.
 *
 * Stdlib only. Works on any agent whose sessions are JSONL files, through
 * per-agent adapters that normalize each line into one event shape.
 *
 * Usage:
 *   bun cluster.ts --agent antigravity --since 2026-10-24 --until 2026-10-30
 *   bun cluster.ts --agent claude --logs ~/.claude/projects --since 2026-10-24
 *   bun cluster.ts --agent codex --since 2026-10-24 --prs-json prs.json
 *
 * Output: cluster-plan JSON array on stdout, warnings on stderr.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

export type AgentName = "antigravity" | "claude" | "codex";

export type Role = "user" | "assistant" | "tool";

export interface TranscriptEvent {
  ts: Date | null;
  role: Role;
  text: string;
  tools: string;
  ntools: number;
  exit: number | null;
  branch: string | null;
}

export interface SessionMeta {
  id: string;
  subagent: boolean;
}

export type SessionData = [SessionMeta, TranscriptEvent[]];

export interface PullRequest {
  number: number;
  title?: string;
  headRefName: string;
  createdAt?: string;
  mergedAt?: string | null;
}

export interface LiveSessionInfo {
  id: string;
  first: Date;
  in_window: boolean;
  turns: number;
  errors: number;
  tool_calls: number;
  prompt: string;
  keys: Map<string, number>;
  primary: string | null;
}

export interface ClusterPlanEntry {
  group_id: number | null;
  topic: string;
  branch_or_pr: string;
  conversation_ids: string[];
  turn_count: number;
  summary: string;
}

export const RETRO_MARKERS = ["/retro", ".agents/skills/retro"] as const;
export const EXIT_RE = /exited with code (\d+)|exit code[: ]+(\d+)/i;
export const PR_RE = /(?:pull\/|PR\s*#|pr\s+#?|#)(\d+)/g;
export const BRANCH_RE =
  /git\s+(?:checkout|switch)\s+(?:-[bBcC]\s+)?([\w][\w./-]*)|gh\s+pr\s+checkout\s+([\w][\w./-]*)/g;
export const ISSUE_BRANCH_RE = /^(\d+)-/;

export function parseTs(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  try {
    if (typeof value === "number") {
      const ms = value < 1e11 ? value * 1000 : value;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const str = String(value).trim();
    if (!str) return null;
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function textOf(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === "object") {
          const dict = c as Record<string, unknown>;
          return textOf(dict.text ?? dict.content ?? "");
        }
        return String(c ?? "");
      })
      .join(" ");
  }
  return "";
}

function readJsonlLines(filePath: string): unknown[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const records: unknown[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      continue;
    }
  }
  return records;
}

export function adaptAntigravity(filePath: string): SessionData {
  const records = readJsonlLines(filePath);
  const events: TranscriptEvent[] = [];
  let hasUser = false;

  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const d = row as Record<string, unknown>;
    const t = d.type;
    const text = (typeof d.content === "string" ? d.content : "") || "";
    let role: Role = "tool";

    if (t === "USER_INPUT") {
      role = "user";
      hasUser = true;
    } else if (t === "PLANNER_RESPONSE") {
      role = "assistant";
    }

    let exitCode: number | null = null;
    if (role === "tool") {
      const m = text.match(EXIT_RE);
      if (m) {
        const codeStr = m[1] ?? m[2];
        if (codeStr !== undefined) {
          exitCode = parseInt(codeStr, 10);
        }
      }
    }

    const toolCalls = Array.isArray(d.tool_calls) ? d.tool_calls : [];
    events.push({
      ts: parseTs(d.created_at),
      role,
      text,
      tools: JSON.stringify(toolCalls),
      ntools: toolCalls.length,
      exit: exitCode,
      branch: null,
    });
  }

  const resolvedPath = path.resolve(filePath);
  const id = path.basename(
    path.dirname(path.dirname(path.dirname(resolvedPath))),
  );

  return [{ id, subagent: !hasUser }, events];
}

export function adaptClaude(filePath: string): SessionData {
  const records = readJsonlLines(filePath);
  const events: TranscriptEvent[] = [];
  let sub = filePath.includes("/subagents/");

  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const d = row as Record<string, unknown>;
    sub = sub || Boolean(d.isSidechain);
    const msg = (
      d.message && typeof d.message === "object" ? d.message : {}
    ) as Record<string, unknown>;
    const content = msg.content;
    const role = d.type;
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    let text = "";
    let tools = "";
    let exitCode: number | null = null;
    let ntools = 0;

    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b || typeof b !== "object") continue;
        const block = b as Record<string, unknown>;
        if (block.type === "text") {
          text += typeof block.text === "string" ? block.text : "";
        } else if (block.type === "tool_use") {
          tools += JSON.stringify(block.input ?? {});
          ntools += 1;
        } else if (block.type === "tool_result") {
          const body = textOf(block.content);
          text += body;
          const m = body.match(EXIT_RE);
          if (block.is_error || m) {
            const codeStr = m ? (m[1] ?? m[2]) : undefined;
            exitCode = codeStr !== undefined ? parseInt(codeStr, 10) : 1;
          }
        }
      }
    } else {
      text = typeof content === "string" ? content : "";
    }

    events.push({
      ts: parseTs(d.timestamp),
      role: role as Role,
      text,
      tools,
      ntools,
      exit: exitCode,
      branch: typeof d.gitBranch === "string" ? d.gitBranch : null,
    });
  }

  const id = path.parse(filePath).name;
  return [{ id, subagent: sub }, events];
}

export function adaptCodex(filePath: string): SessionData {
  const records = readJsonlLines(filePath);
  const events: TranscriptEvent[] = [];
  let sid = path.parse(filePath).name;

  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const d = row as Record<string, unknown>;
    const p = (
      d.payload && typeof d.payload === "object" ? d.payload : {}
    ) as Record<string, unknown>;
    if (d.type === "session_meta") {
      if (typeof p.id === "string") {
        sid = p.id;
      }
      continue;
    }

    const ptype = p.type;
    let role: Role = "tool";
    let text = "";
    let tools = "";
    let exitCode: number | null = null;

    if (ptype === "message") {
      const r = p.role;
      if (r !== "user" && r !== "assistant") {
        continue;
      }
      role = r as Role;
      text = textOf(p.content);
    } else if (ptype === "function_call") {
      role = "assistant";
      tools = String(p.arguments ?? "");
    } else if (ptype === "function_call_output") {
      text = textOf(p.output);
      const m = text.match(EXIT_RE);
      if (m) {
        const codeStr = m[1] ?? m[2];
        if (codeStr !== undefined) {
          exitCode = parseInt(codeStr, 10);
        }
      }
    } else {
      continue;
    }

    events.push({
      ts: parseTs(d.timestamp),
      role,
      text,
      tools,
      ntools: ptype === "function_call" ? 1 : 0,
      exit: exitCode,
      branch: null,
    });
  }

  return [{ id: sid, subagent: false }, events];
}

export const ADAPTERS: Record<
  AgentName,
  {
    adapt: (filePath: string) => SessionData;
    defaultGlob: string;
  }
> = {
  antigravity: {
    adapt: adaptAntigravity,
    defaultGlob:
      "~/.gemini/antigravity/brain/*/.system_generated/logs/transcript.jsonl",
  },
  claude: {
    adapt: adaptClaude,
    defaultGlob: "~/.claude/projects/**/*.jsonl",
  },
  codex: {
    adapt: adaptCodex,
    defaultGlob: "~/.codex/sessions/**/*.jsonl",
  },
};

export function loadPrs(filePath?: string | null): PullRequest[] {
  if (filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as PullRequest[];
    } catch (e) {
      console.error(`warning: failed to read PR file ${filePath}: ${e}`);
      return [];
    }
  }

  try {
    const out = execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        "100",
        "--json",
        "number,title,headRefName,createdAt,mergedAt",
      ],
      { encoding: "utf-8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(out) as PullRequest[];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `warning: no PR map (${msg}); grouping by branch and issue mentions only`,
    );
    return [];
  }
}

export function keysFor(
  events: TranscriptEvent[],
  prs: PullRequest[],
): Map<string, number> {
  const byPr = new Map<string, string>();
  const branches = new Set<string>();
  const byIssue = new Map<string, string>();

  for (const p of prs) {
    byPr.set(String(p.number), p.headRefName);
    branches.add(p.headRefName);
  }

  for (const b of Array.from(branches).toSorted()) {
    const m = b.match(ISSUE_BRANCH_RE);
    if (m && m[1]) {
      if (!byIssue.has(m[1])) {
        byIssue.set(m[1], b);
      }
    }
  }

  const keys = new Map<string, number>();
  const addKey = (k: string) => {
    keys.set(k, (keys.get(k) ?? 0) + 1);
  };

  for (const e of events) {
    if (
      e.branch &&
      e.branch !== "main" &&
      e.branch !== "master" &&
      e.branch !== "HEAD"
    ) {
      addKey(e.branch);
    }

    const blob = e.tools + (e.role === "user" ? e.text : "");

    BRANCH_RE.lastIndex = 0;
    const branchMatches = e.tools.matchAll(BRANCH_RE);
    for (const m of branchMatches) {
      const b = m[1] || m[2];
      if (b && branches.has(b)) {
        addKey(b);
      }
    }

    PR_RE.lastIndex = 0;
    const prMatches = blob.matchAll(PR_RE);
    for (const m of prMatches) {
      const n = m[1];
      if (!n) continue;
      const targetPr = byPr.get(n);
      if (targetPr) {
        addKey(targetPr);
      } else {
        const targetIssue = byIssue.get(n);
        if (targetIssue) {
          addKey(targetIssue);
        }
      }
    }
  }

  return keys;
}

function getPrimary(keys: Map<string, number>): string | null {
  if (keys.size === 0) return null;
  let maxCount = -1;
  let primaryKey: string | null = null;
  for (const [key, count] of keys.entries()) {
    if (count > maxCount) {
      maxCount = count;
      primaryKey = key;
    }
  }
  return primaryKey;
}

function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function entry(
  members: LiveSessionInfo[],
  branch: string,
  topic: string,
): ClusterPlanEntry {
  const firstSession = members[0]!;
  const lastSession = members[members.length - 1]!;
  const totalTurns = members.reduce((sum, s) => sum + s.turns, 0);
  const totalErrors = members.reduce((sum, s) => sum + s.errors, 0);

  return {
    group_id: null,
    topic,
    branch_or_pr: branch,
    conversation_ids: members.map((s) => s.id),
    turn_count: totalTurns,
    summary: `${members.length} sessions, ${totalErrors} non-zero exits, first ${formatDate(firstSession.first)}, last ${formatDate(lastSession.first)}`,
  };
}

export function cluster(
  sessions: SessionData[],
  since: Date,
  until: Date,
  prs: PullRequest[],
): ClusterPlanEntry[] {
  const live: LiveSessionInfo[] = [];

  for (const [meta, events] of sessions) {
    if (meta.subagent) {
      continue;
    }
    const users = events.filter((e) => e.role === "user").map((e) => e.text);
    if (users.some((u) => RETRO_MARKERS.some((m) => u.includes(m)))) {
      continue;
    }

    const stamps = events
      .map((e) => e.ts)
      .filter((ts): ts is Date => ts !== null);
    if (stamps.length === 0) {
      continue;
    }

    const first = new Date(Math.min(...stamps.map((s) => s.getTime())));
    const in_window = stamps.some(
      (s) => s.getTime() >= since.getTime() && s.getTime() <= until.getTime(),
    );
    const turns = users.length;
    const errors = events.filter((e) => e.exit !== null && e.exit !== 0).length;
    const tool_calls = events.reduce((sum, e) => sum + e.ntools, 0);

    let prompt = "";
    if (users.length > 0 && users[0]) {
      const firstLine = users[0].trim().split(/\r?\n/)[0] ?? "";
      prompt = firstLine.slice(0, 100);
    }

    const keys = keysFor(events, prs);
    const primary = getPrimary(keys);

    live.push({
      id: meta.id,
      first,
      in_window,
      turns,
      errors,
      tool_calls,
      prompt,
      keys,
      primary,
    });
  }

  const windowKeys = new Set<string>();
  for (const s of live) {
    if (s.in_window && s.primary) {
      windowKeys.add(s.primary);
    }
  }

  const grouped = new Map<string, LiveSessionInfo[]>();
  const standalone: LiveSessionInfo[] = [];

  for (const s of live) {
    if (s.primary) {
      if (windowKeys.has(s.primary)) {
        let group = grouped.get(s.primary);
        if (!group) {
          group = [];
          grouped.set(s.primary, group);
        }
        group.push(s);
      }
    } else if (
      s.in_window &&
      (s.turns >= 2 || s.errors > 0 || s.tool_calls >= 5)
    ) {
      standalone.push(s);
    }
  }

  const plan: ClusterPlanEntry[] = [];

  const sortedGroups = Array.from(grouped.values()).toSorted((a, b) => {
    const minA = Math.min(...a.map((s) => s.first.getTime()));
    const minB = Math.min(...b.map((s) => s.first.getTime()));
    return minA - minB;
  });

  for (const members of sortedGroups) {
    const sortedMembers = members.toSorted(
      (a, b) => a.first.getTime() - b.first.getTime(),
    );
    const branch = sortedMembers[0]!.primary!;
    plan.push(entry(sortedMembers, branch, sortedMembers[0]!.prompt));
  }

  if (standalone.length > 0) {
    const sortedStandalone = standalone.toSorted(
      (a, b) => a.first.getTime() - b.first.getTime(),
    );
    plan.push(
      entry(
        sortedStandalone,
        "standalone",
        "Standalone conversations without branch or PR links",
      ),
    );
  }

  return plan.map((p, idx) => ({
    group_id: idx + 1,
    topic: p.topic,
    branch_or_pr: p.branch_or_pr,
    conversation_ids: p.conversation_ids,
    turn_count: p.turn_count,
    summary: p.summary,
  }));
}

function expandUser(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function parseSinceDate(str: string): Date {
  const parts = str.split("-").map((x) => parseInt(x, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    throw new Error(`Invalid --since date format: ${str}`);
  }
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

export function parseUntilDate(str?: string): Date {
  if (str) {
    const parts = str.split("-").map((x) => parseInt(x, 10));
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (
      !y ||
      !m ||
      !d ||
      Number.isNaN(y) ||
      Number.isNaN(m) ||
      Number.isNaN(d)
    ) {
      throw new Error(`Invalid --until date format: ${str}`);
    }
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  }
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      agent: { type: "string" },
      logs: { type: "string" },
      since: { type: "string" },
      until: { type: "string" },
      "prs-json": { type: "string" },
    },
    strict: true,
  });

  const agent = values.agent as AgentName | undefined;
  if (!agent || !(agent in ADAPTERS)) {
    console.error("error: --agent <antigravity|claude|codex> is required");
    return 1;
  }

  if (!values.since) {
    console.error("error: --since YYYY-MM-DD is required");
    return 1;
  }

  const { adapt, defaultGlob } = ADAPTERS[agent];
  let pattern = expandUser(values.logs ?? defaultGlob);
  if (
    values.logs &&
    fs.existsSync(pattern) &&
    fs.statSync(pattern).isDirectory()
  ) {
    pattern = path.join(pattern, "**", "*.jsonl");
  }

  const since = parseSinceDate(values.since);
  const until = parseUntilDate(values.until);

  const paths = fs.globSync(pattern).toSorted();
  if (paths.length === 0) {
    console.error(`error: no transcripts match ${pattern}`);
    return 1;
  }

  const sessions = paths.map((p) => adapt(p));
  const prs = loadPrs(values["prs-json"]);
  const plan = cluster(sessions, since, until, prs);

  console.log(JSON.stringify(plan, null, 2));
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
