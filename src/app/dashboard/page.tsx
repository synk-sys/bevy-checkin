import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { LiveDashboard } from "./LiveDashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <AppShell>
      <LiveDashboard />
    </AppShell>
  );
}
