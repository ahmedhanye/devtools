import type { Metadata } from "next";
import type * as React from "react";
import { AppLayout } from "@/shared/ui";
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
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
