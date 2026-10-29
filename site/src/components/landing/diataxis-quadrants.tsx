import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  DIATAXIS_QUADRANTS,
  type DiataxisQuadrant,
} from "../../lib/landing-data";
import { LandingIconBadge, LandingSectionShell } from "./section-shell";

export function DiataxisSection() {
  return (
    <LandingSectionShell
      title="Documentation"
      description="Structured guides and technical references across four documentation sections."
      gridClassName="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {DIATAXIS_QUADRANTS.map((quadrant: DiataxisQuadrant) => (
        <Link
          key={quadrant.id}
          href={quadrant.href}
          className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
        >
          <div>
            <LandingIconBadge name={quadrant.icon} />
            <h3 className="mt-4 font-semibold text-foreground group-hover:text-primary transition-colors">
              {quadrant.title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {quadrant.description}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">
            <span>View</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </LandingSectionShell>
  );
}
