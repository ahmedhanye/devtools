import type { Metadata } from "next";
import { DashboardPage } from "@/pages/dashboard";

export const metadata: Metadata = {
  title: "Dashboard | DevTools",
  description: "DevTools system dashboard and developer workspace.",
};

export default function Page() {
  return <DashboardPage />;
}
