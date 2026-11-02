"use client";

let ctx: AudioContext | null = null;

/** Short audio cue so volunteers don't need to read the screen for every scan. */
export function beep(kind: "ok" | "warn" | "error") {
  try {
    if (localStorage.getItem("checkin:sound") === "off") return;
    ctx ??= new AudioContext();
    const tones = kind === "ok" ? [880, 1320] : kind === "warn" ? [660, 660] : [220];
    tones.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.18, ctx!.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, ctx!.currentTime + i * 0.14 + 0.12);
      o.connect(g).connect(ctx!.destination);
      o.start(ctx!.currentTime + i * 0.14);
      o.stop(ctx!.currentTime + i * 0.14 + 0.13);
    });
  } catch {}
}
