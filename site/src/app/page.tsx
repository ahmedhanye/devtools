import {
  DiataxisSection,
  LandingFooter,
  LandingHeader,
  LandingHero,
  PlatformFeaturesSection,
} from "../components/landing";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
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
