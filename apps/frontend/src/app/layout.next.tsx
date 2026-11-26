import type { Metadata } from "next";
import type * as React from "react";
import { AppShell } from "./layouts/app-shell";
import { QueryProvider } from "./providers/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevTools System Dashboard",
  description: "Single-process loopback daemon runtime & service monitor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
