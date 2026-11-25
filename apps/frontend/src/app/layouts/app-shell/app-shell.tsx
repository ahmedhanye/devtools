"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, LayoutDashboard, SquareTerminal } from "lucide-react";
import { ActiveAuditJobIndicator } from "@/features/lighthouse/active-audit-job";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/shared/ui";

interface ShellNavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PLATFORM_NAV_ITEMS: readonly ShellNavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Lighthouse",
    href: "/lighthouse",
    icon: Gauge,
  },
];

interface BreadcrumbRouteSpec {
  parentLabel?: string;
  parentHref?: string;
  currentLabel: string;
}

const BREADCRUMB_BY_ROUTE: Record<string, BreadcrumbRouteSpec> = {
  "/lighthouse": {
    parentLabel: "Lighthouse",
    currentLabel: "Audit History",
  },
  "/lighthouse/compare": {
    parentLabel: "Lighthouse",
    parentHref: "/lighthouse",
    currentLabel: "Compare Runs",
  },
  "/lighthouse/run": {
    parentLabel: "Lighthouse",
    parentHref: "/lighthouse",
    currentLabel: "Audit Run",
  },
};

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function resolveBreadcrumbSpec(pathname: string | null): BreadcrumbRouteSpec {
  if (!pathname || pathname === "/") {
    return { currentLabel: "Dashboard" };
  }
  const exact = BREADCRUMB_BY_ROUTE[pathname];
  if (exact) {
    return exact;
  }
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "Dashboard";
  const currentLabel = last.charAt(0).toUpperCase() + last.slice(1);
  if (segments.length <= 1) {
    return { currentLabel };
  }
  const parentSegment = segments[0] ?? "";
  return {
    parentLabel: parentSegment.charAt(0).toUpperCase() + parentSegment.slice(1),
    parentHref: `/${parentSegment}`,
    currentLabel,
  };
}

function HeaderBreadcrumbs({ pathname }: { pathname: string | null }) {
  const spec = resolveBreadcrumbSpec(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {spec.parentLabel ? (
          <>
            <BreadcrumbItem>
              {spec.parentHref ? (
                <BreadcrumbLink render={<Link href={spec.parentHref} />}>
                  {spec.parentLabel}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{spec.parentLabel}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        ) : null}
        <BreadcrumbItem>
          <BreadcrumbPage>{spec.currentLabel}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Application-wide shell layout owning sidebar navigation, URL-derived header breadcrumbs,
 * and the top-bar active Lighthouse Audit Job indicator.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-start text-sm group-data-[collapsible=icon]:p-0!">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <SquareTerminal className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">DevTools</span>
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {PLATFORM_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = isNavItemActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ms-1" />
            <Separator orientation="vertical" className="me-1 h-4" />
            <div className="min-w-0 truncate">
              <HeaderBreadcrumbs pathname={pathname} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ActiveAuditJobIndicator />
          </div>
        </header>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
