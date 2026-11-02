"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Camera QR scanner. Uses the native BarcodeDetector when available
 * (Chrome/Android/macOS) and falls back to jsQR on canvas frames elsewhere.
 * The same code is ignored for a few seconds so one ticket held up to the
 * camera produces one check-in.
 */
export function QrScanner({ onScan, paused }: { onScan: (code: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onScanRef.current = onScan;
    pausedRef.current = paused;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let detector: Detector | null = null;

    (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector;
        if (BD) detector = new BD({ formats: ["qr_code"] });
      } catch {}
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      } catch {
        setError("Camera unavailable. Allow camera access, or use a USB scanner / type the code.");
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const loop = async () => {
        if (stopped) return;
        if (!pausedRef.current && video.readyState >= 2) {
          let code: string | null = null;
          try {
            if (detector) code = (await detector.detect(video))[0]?.rawValue ?? null;
            else if (ctx) {
              const w = Math.min(640, video.videoWidth);
              const h = Math.round((video.videoHeight / video.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          } catch {}
          const now = Date.now();
          if (code && !(last.current && last.current.code === code && now - last.current.at < 4000)) {
            last.current = { code, at: now };
            onScanRef.current(code);
          }
        }
        timer = setTimeout(loop, 160);
      };
      loop();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline aria-label="Camera preview for QR scanning" />
      <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" aria-hidden="true" />
      {error && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">{error}</p>}
    </div>
  );
}
