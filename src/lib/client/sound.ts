"use client";

let ctx: AudioContext | null = null;

/**
 * Mobile browsers (Safari on iPhone especially) only let a page start audio
 * inside a tap or key press. Camera scans beep without one, so the first tap
 * or key press on the desk creates and unlocks the audio context for later.
 */
export function unlockAudioOnFirstTouch() {
  const events = ["pointerdown", "touchend", "keydown"] as const;
  const stop = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  function unlock() {
    try {
      ctx ??= new AudioContext();
      // A silent one-sample sound completes the unlock on older iOS versions.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume().then(() => ctx?.state === "running" && stop(), () => {});
    } catch {}
  }
  events.forEach((e) => window.addEventListener(e, unlock, true));
  return stop;
}

/** Short audio cue so volunteers don't need to read the screen for every scan. */
export function beep(kind: "ok" | "warn" | "error") {
  try {
    if (localStorage.getItem("checkin:sound") === "off") return;
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
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
