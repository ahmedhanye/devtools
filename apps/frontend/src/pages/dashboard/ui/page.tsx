import * as React from "react";
import { LayoutDashboard } from "lucide-react";

export function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
      <div className="bg-muted/50 text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-lg">
        <LayoutDashboard className="size-6" />
      </div>
      <h2 className="text-foreground text-lg font-semibold tracking-tight">
        Welcome to DevTools
      </h2>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        Your developer tooling workspace is ready.
      </p>
    </div>
  );
}
