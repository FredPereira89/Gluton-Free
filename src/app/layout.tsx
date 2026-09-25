import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { ServiceWorkerRegistration } from "@/web/pwa-settings";
import "./globals.css";

const sans = Schibsted_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Gluton-Free",
  description: "Verdicts on Lisbon Restaurants, read from what diners write.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Gluton-Free", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0E6170" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ServiceWorkerRegistration />
        <header className="topbar">
          <Link href="/">Gluton-Free</Link>
          <span>Provisional · Lisboa</span>
          <Link href="/settings">Settings</Link>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
