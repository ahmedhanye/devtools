import { Cpu, Database, Server, Terminal } from "lucide-react";
import {
  type FeatureIconName,
  PLATFORM_FEATURES,
  type PlatformFeature,
} from "../../lib/landing-data";

const FEATURE_ICON_MAP: Record<FeatureIconName, typeof Terminal> = {
  Cpu,
  Terminal,
  Server,
  Database,
};

export function PlatformFeaturesSection() {
  return (
    <section className="border-b border-border/40 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Core Capabilities
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Essential building blocks of the DevTools developer runtime stack.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLATFORM_FEATURES.map((feature: PlatformFeature) => {
            const IconComponent = FEATURE_ICON_MAP[feature.icon];
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-border/80"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <IconComponent className="size-4" />
                  </div>
                  <h3 className="font-semibold text-foreground">
                    {feature.title}
                  </h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
