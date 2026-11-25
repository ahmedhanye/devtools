import * as React from "react";
import { LayoutDashboard } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/ui";

/**
 * Primary dashboard presentation page rendering the workspace empty state.
 *
 * @returns Dashboard page presentation component.
 */
export function DashboardPage() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LayoutDashboard />
        </EmptyMedia>
        <EmptyTitle>Welcome to DevTools</EmptyTitle>
        <EmptyDescription>
          Your developer tooling workspace is ready.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
