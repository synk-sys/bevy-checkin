import { AppShell } from "@/components/AppShell";
import { DeskStation } from "./DeskStation";

export default function DeskPage() {
  return (
    <AppShell staffOnly>
      <DeskStation />
    </AppShell>
  );
}
