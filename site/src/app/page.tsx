import { DiataxisSection } from "../components/landing/diataxis-quadrants";
import { LandingFooter } from "../components/landing/footer";
import { LandingHeader } from "../components/landing/header";
import { LandingHero } from "../components/landing/hero";
import { PlatformFeaturesSection } from "../components/landing/platform-features";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <PlatformFeaturesSection />
        <DiataxisSection />
      </main>
      <LandingFooter />
    </div>
  );
}
