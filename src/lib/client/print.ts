"use client";

/** Print an attendee's badge via a hidden iframe (no popup blockers, no navigation). */
export function printBadge(attendeeId: string) {
  const old = document.getElementById("badge-print-frame");
  old?.remove();
  const frame = document.createElement("iframe");
  frame.id = "badge-print-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = `/badge/${encodeURIComponent(attendeeId)}?embed=1`;
  document.body.appendChild(frame);
}
