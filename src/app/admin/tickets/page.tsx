import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { TestTickets } from "./TestTickets";

export const metadata: Metadata = { title: "Test tickets" };

export default function TicketsPage() {
  return (
    <AppShell admin>
      <TestTickets />
    </AppShell>
  );
}
