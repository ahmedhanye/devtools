"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, SquareTerminal } from "lucide-react";
import {
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
} from "@/shared/ui/shadcn/sidebar";

/**
 * Navigation item entry displayed in the application sidebar shell.
 */
export interface NavItem {
  /** Human-readable label for the navigation destination. */
  title: string;
  /** Route pathname (`href`) linked by the sidebar button. */
  href: string;
  /** Icon component rendered alongside the label. */
  icon: React.ComponentType<{ className?: string }>;
}

const DEFAULT_NAV_ITEMS: readonly NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
];

/**
 * Props for the {@link AppLayout} shell component.
 */
export interface AppLayoutProps {
  /** Primary page content rendered inside the sidebar inset region. */
  children: React.ReactNode;
  /** Navigation links rendered in the collapsible sidebar menu. */
  navItems?: readonly NavItem[];
}

/**
 * Collapsible application shell providing sidebar navigation, header trigger, and main content inset.
 *
 * @param props - Children and optional navigation item definitions.
 * @returns Rendered application shell layout.
 */
export function AppLayout({
  children,
  navItems = DEFAULT_NAV_ITEMS,
}: AppLayoutProps) {
  const pathname = usePathname();

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
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
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
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-1" />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
