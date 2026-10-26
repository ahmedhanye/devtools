import {
  PLATFORM_FEATURES,
  type PlatformFeature,
} from "../../lib/landing-data";
import { LandingIconBadge, LandingSectionShell } from "./section-shell";

export function PlatformFeaturesSection() {
  return (
    <LandingSectionShell
      title="Core Capabilities"
      description="Essential building blocks of the DevTools developer runtime stack."
      gridClassName="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {PLATFORM_FEATURES.map((feature: PlatformFeature) => (
        <div
          key={feature.title}
          className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-border/80"
        >
          <div className="flex items-center gap-3">
            <LandingIconBadge name={feature.icon} />
            <h3 className="font-semibold text-foreground">{feature.title}</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {feature.description}
          </p>
        </div>
      ))}
    </LandingSectionShell>
  );
}
