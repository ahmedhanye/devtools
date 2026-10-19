import {
  ArrowRight,
  BookOpen,
  Compass,
  GraduationCap,
  Layers,
} from "lucide-react";
import Link from "next/link";
import {
  DIATAXIS_QUADRANTS,
  type DiataxisQuadrant,
  type QuadrantIconName,
} from "../../lib/landing-data";

const QUADRANT_ICON_MAP: Record<QuadrantIconName, typeof BookOpen> = {
  GraduationCap,
  Compass,
  BookOpen,
  Layers,
};

export function DiataxisSection() {
  return (
    <section className="border-b border-border/40 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Documentation
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Structured guides and technical references across four documentation
            sections.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DIATAXIS_QUADRANTS.map((quadrant: DiataxisQuadrant) => {
            const IconComponent = QUADRANT_ICON_MAP[quadrant.icon];
            return (
              <Link
                key={quadrant.id}
                href={quadrant.href}
                className="group flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50"
              >
                <div>
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <IconComponent className="size-4" />
                  </div>
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
            );
          })}
        </div>
      </div>
    </section>
  );
}
