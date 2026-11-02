import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { AttendeeTable } from "./AttendeeTable";

export const metadata: Metadata = { title: "Attendees" };

export default function AttendeesPage() {
  return (
    <AppShell admin>
      <AttendeeTable />
    </AppShell>
  );
}
