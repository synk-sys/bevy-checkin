import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import { SessionProvider } from "@/hooks/useSession";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-face", display: "swap" });
const display = Outfit({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Check-in Desk", template: "%s · Check-in Desk" },
  description: "Attendee check-in for Bevy events: QR scanning, search, badges and a live dashboard.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#1a73e8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
