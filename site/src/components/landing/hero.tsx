import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Sparkles,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { GITHUB_REPO_URL, HERO_CONFIG } from "../../lib/landing-data";
import { GithubIcon } from "../icons";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-border/40 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3.5 py-1 text-xs font-medium text-foreground">
            <Sparkles className="size-3.5 text-primary" />
            <span>{HERO_CONFIG.badge}</span>
          </div>

          {/* Headline - fully visible, high-contrast, no transparent text */}
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {HERO_CONFIG.headline}
          </h1>

          {/* Subtitle */}
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {HERO_CONFIG.description}
          </p>

          {/* Clean Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={HERO_CONFIG.primaryCta.href}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <BookOpen className="size-4" />
              <span>{HERO_CONFIG.primaryCta.label}</span>
              <ArrowRight className="size-4" />
            </Link>

            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <GithubIcon className="size-4" />
              <span>{HERO_CONFIG.secondaryCta.label}</span>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </a>
          </div>

          {/* Terminal Box - clean, high-contrast */}
          <div className="mt-12 w-full max-w-2xl text-left">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b border-border/80 bg-muted/50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="size-2.5 rounded-full bg-muted-foreground/30" />
                  <div className="size-2.5 rounded-full bg-muted-foreground/30" />
                  <div className="size-2.5 rounded-full bg-muted-foreground/30" />
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                  <Terminal className="size-3" />
                  <span>devtools web</span>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  bun
                </div>
              </div>
              <div className="p-4 font-mono text-xs leading-relaxed sm:text-sm text-foreground">
                <div className="text-muted-foreground">
                  <span className="text-primary font-bold">$</span> bun run
                  devtools web --port 4000
                </div>
                <div className="mt-2 text-foreground">
                  <span className="font-semibold text-primary">[daemon]</span>{" "}
                  Bound to loopback host{" "}
                  <span className="underline decoration-muted-foreground">
                    http://127.0.0.1:4000
                  </span>
                </div>
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">[api]</span>{" "}
                  Hono API routes mounted in-process at /api/*
                </div>
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">[ui]</span>{" "}
                  Next.js dashboard static assets served from memory
                </div>
                <div className="mt-2 text-muted-foreground">
                  <span className="text-primary font-bold">✓</span> Daemon
                  running (single Bun process).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
