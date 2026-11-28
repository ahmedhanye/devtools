import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { TooltipProvider } from "../tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "./sidebar";

function clearSidebarStorage(Story: React.ComponentType) {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("sidebar_state");
    } catch {
      // Ignore storage errors in restricted environments
    }
  }
  return <Story />;
}

const meta: Meta<typeof Sidebar> = {
  title: "Shared/Shadcn/Sidebar",
  component: Sidebar,
  tags: ["autodocs"],
  decorators: [clearSidebarStorage],
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

function SampleSidebar({
  defaultOpen = true,
  collapsible = "icon",
}: {
  defaultOpen?: boolean;
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <Sidebar collapsible={collapsible}>
          <SidebarHeader>
            <div className="px-2 py-1 text-sm font-semibold">DevTools</div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive tooltip="Dashboard">
                      <span>Dashboard</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Lighthouse">
                      <span>Lighthouse</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter>
            <div className="px-2 py-1 text-xs text-muted-foreground">v1.0</div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <span className="text-sm font-medium">Overview</span>
          </header>
          <div className="p-4 text-sm text-muted-foreground">
            Workspace content area.
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export const Default: Story = {
  render: () => <SampleSidebar defaultOpen />,
};

export const Collapsed: Story = {
  render: () => <SampleSidebar defaultOpen={false} collapsible="icon" />,
};

export const Loading: Story = {
  render: () => (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="none">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Loading</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </TooltipProvider>
  ),
};

export const InteractiveToggle: Story = {
  render: () => <SampleSidebar defaultOpen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = canvasElement.querySelector('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "expanded");

    const trigger = canvas.getByRole("button", { name: "Toggle Sidebar" });
    await expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");

    await userEvent.click(trigger);
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  },
};
