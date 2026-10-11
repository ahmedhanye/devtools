import { ExternalLink, Terminal } from "lucide-react";
import Link from "next/link";
import { GITHUB_REPO_URL } from "../../lib/landing-data";
import { GithubIcon } from "../icons";

const CURRENT_YEAR = new Date().getFullYear();

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/20 py-8 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-medium text-foreground transition-colors hover:text-primary"
        >
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Terminal className="size-3.5" />
          </div>
          <span>DevTools</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/docs"
            className="transition-colors hover:text-foreground"
          >
            Docs
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-3.5" />
            <span>GitHub</span>
            <ExternalLink className="size-3 text-muted-foreground" />
          </a>
        </div>

        <p>© {CURRENT_YEAR} DevTools. All rights reserved.</p>
      </div>
    </footer>
  );
}
