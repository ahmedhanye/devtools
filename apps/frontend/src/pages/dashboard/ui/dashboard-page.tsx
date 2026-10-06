"use client";

import { useIsMounted, useNativeSearchParams } from "@/shared/lib";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui";
import { Box, Layers, LayoutDashboard, Radio, Terminal } from "lucide-react";
import type * as React from "react";
import { useServiceHealth } from "../model";
import { ServiceStatusCard } from "./service-status-card";
import { ServiceStatusCardError } from "./service-status-card-error";
import { ServiceStatusCardSkeleton } from "./service-status-card-skeleton";

interface DashboardShellProps {
  title?: string;
  description?: string;
  host?: string;
  children: React.ReactNode;
}

function DashboardShell({
  title = "DevTools System Dashboard",
  description = "Single-process loopback daemon runtime & service monitor",
  host = "127.0.0.1:4000",
  children,
}: DashboardShellProps) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border bg-card/60 sticky top-0 z-10 border-b backdrop-blur-xs">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg shadow-xs">
              <LayoutDashboard className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{title}</h1>
              <p className="text-muted-foreground text-xs">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <Radio className="text-primary size-3 animate-pulse" />
              {host}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto flex-1 px-4 py-8">{children}</main>

      <footer className="border-border text-muted-foreground border-t py-4 text-center text-xs">
        DevTools Monorepo &copy; 2026 &bull; Single-Process Loopback Daemon
      </footer>
    </div>
  );
}

export interface DashboardPageProps {
  autoFetch?: boolean;
}

interface StackComponentInfo {
  title: string;
  packageName: string;
  description: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STACK_COMPONENTS: StackComponentInfo[] = [
  {
    title: "Shared Domain Core",
    packageName: "@devtools/core",
    description: "Strict runtime schema validation active via Zod.",
    detail: "HealthResponseSchema verified",
    icon: Box,
  },
  {
    title: "Loopback Daemon",
    packageName: "@devtools/cli",
    description:
      "Serves static export bundle at / and routes /api/* on port 4000.",
    detail: "Single-process daemon serving",
    icon: Terminal,
  },
  {
    title: "Web Application Shell",
    packageName: "@devtools/frontend",
    description: "Feature-Sliced Design v2.1 static HTML/CSS/JS export.",
    detail: "Dist Directory: apps/frontend/dist",
    icon: Layers,
  },
];

export function DashboardPage({ autoFetch = true }: DashboardPageProps) {
  const health = useServiceHealth({
    endpoint: "/api/health",
    pollingInterval: 5000,
    autoFetch,
  });

  const mounted = useIsMounted();
  const searchParams = useNativeSearchParams();
  const host =
    searchParams.get("host") ||
    (mounted && typeof window !== "undefined"
      ? window.location.host
      : "127.0.0.1:4000");

  let statusCard: React.ReactNode;
  if (health.status === "error") {
    statusCard = (
      <ServiceStatusCardError
        name="DevTools API Service"
        error={health.error}
        onRefresh={health.refresh}
      />
    );
  } else if (health.status === "success") {
    statusCard = (
      <ServiceStatusCard
        name="DevTools API Service"
        data={health.data}
        onRefresh={health.refresh}
      />
    );
  } else if (health.status === "loading" && health.data !== null) {
    statusCard = (
      <ServiceStatusCard
        name="DevTools API Service"
        data={health.data}
        onRefresh={health.refresh}
        isRefreshing={true}
      />
    );
  } else {
    statusCard = <ServiceStatusCardSkeleton name="DevTools API Service" />;
  }

  return (
    <DashboardShell host={host}>
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Active Services</h2>
          <p className="text-muted-foreground text-sm">
            Monitored components within the interconnected runtime stack.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {statusCard}

          {STACK_COMPONENTS.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.packageName}
                className="flex flex-col justify-between"
              >
                <CardHeader>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.packageName}</CardDescription>
                  <CardAction>
                    <div className="bg-primary/10 text-primary rounded-md p-2">
                      <Icon className="size-4" />
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-sm">
                      {item.description}
                    </p>
                    <div className="text-foreground flex items-center gap-2 pt-1 font-mono text-xs">
                      <span>{item.detail}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardShell>
  );
}
