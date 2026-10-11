import { BookOpen, ExternalLink, Terminal } from "lucide-react";
import Link from "next/link";
import { NAV_LINKS } from "../../lib/landing-data";
import { GithubIcon } from "../icons";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-bold tracking-tight text-foreground transition-colors hover:text-primary"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Terminal className="size-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">DevTools</span>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            v0.1.0
          </span>
        </Link>

        <nav className="flex items-center gap-3" aria-label="Main navigation">
          {NAV_LINKS.map((link) =>
            link.isExternal ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                aria-label={`DevTools ${link.label} repository`}
              >
                <GithubIcon className="size-4" />
                <span className="hidden sm:inline">{link.label}</span>
                <ExternalLink className="size-3 text-muted-foreground" />
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <BookOpen className="size-4 text-primary" />
                <span>{link.label}</span>
              </Link>
            ),
          )}
        </nav>
      </div>
    </header>
  );
}
