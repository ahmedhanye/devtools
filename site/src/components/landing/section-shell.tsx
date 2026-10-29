import {
  BookOpen,
  Compass,
  Cpu,
  Database,
  GraduationCap,
  Layers,
  Server,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import type { FeatureIconName, QuadrantIconName } from "../../lib/landing-data";

const LANDING_ICON_MAP: Record<
  QuadrantIconName | FeatureIconName,
  typeof BookOpen
> = {
  GraduationCap,
  Compass,
  BookOpen,
  Layers,
  Cpu,
  Terminal,
  Server,
  Database,
};

export function LandingIconBadge({
  name,
}: {
  name: QuadrantIconName | FeatureIconName;
}) {
  const IconComponent = LANDING_ICON_MAP[name];
  return (
    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <IconComponent className="size-4" />
    </div>
  );
}

export interface LandingSectionShellProps {
  title: string;
  description: string;
  gridClassName: string;
  children: ReactNode;
}

export function LandingSectionShell({
  title,
  description,
  gridClassName,
  children,
}: LandingSectionShellProps) {
  return (
    <section className="border-b border-border/40 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>
        <div className={gridClassName}>{children}</div>
      </div>
    </section>
  );
}
