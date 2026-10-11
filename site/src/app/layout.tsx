import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";

export const metadata = {
  title: {
    template: "%s | DevTools Documentation",
    default: "DevTools Documentation",
  },
  description: "Developer tooling documentation platform and guides",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
