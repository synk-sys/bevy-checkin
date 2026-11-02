import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { AdminPanel } from "./AdminPanel";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <AppShell admin>
      <AdminPanel />
    </AppShell>
  );
}
