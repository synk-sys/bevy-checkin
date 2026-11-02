import type { Metadata } from "next";
import { Suspense } from "react";
import { BadgeView } from "./BadgeView";

export const metadata: Metadata = { title: "Badge" };

export default function BadgePage() {
  return (
    <Suspense>
      <BadgeView />
    </Suspense>
  );
}
