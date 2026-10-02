import type { Metadata, Viewport } from "next";
import { Bagel_Fat_One, Courier_Prime, Figtree } from "next/font/google";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AuthError } from "@/lib/auth";
import { pageRole } from "@/lib/page-role";
import { Brand } from "@/web/brand";
import { FeedbackWidget } from "@/web/feedback-widget";
import { ServiceWorkerRegistration } from "@/web/pwa-settings";
import { ShortlistDock, ShortlistProvider, SignOutButton } from "@/web/shortlist";
import "./globals.css";

const sans = Figtree({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
// Bagel Fat One is the cut-paper voice: the wordmark, headlines, Restaurant names and Verdicts. One weight only.
const display = Bagel_Fat_One({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--font-display", display: "swap" });
// Courier Prime is for ledger data only: prices, counts, dates and the Evidence figures.
const mono = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Gluton-Free",
  description: "A Lisbon Restaurant Verdict guide: clear Verdicts, read from what diners write.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Gluton-Free", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FFD23F" }, { media: "(prefers-color-scheme: dark)", color: "#0E1233" }] };

async function SignedInNavigation() {
  try {
    const role = await pageRole();
    return <nav className="global-nav" aria-label="Main navigation">
      <FeedbackWidget />
      <Link href="/">Directory</Link>
      <Link href={role === "invitee" ? "/account" : "/settings"}>{role === "invitee" ? "Your data" : "Settings"}</Link>
      <SignOutButton />
    </nav>;
  } catch (error) {
    if (error instanceof AuthError) return null;
    throw error;
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <ServiceWorkerRegistration />
        <ShortlistProvider>
          <a className="skip-link" href="#main-content">Skip to content</a>
          <header className="topbar">
            <Brand />
            <span className="tagline">Lisboa · Invitation-only beta</span>
            <SignedInNavigation />
          </header>
          <main id="main-content" className="wrap">{children}</main>
          <Suspense fallback={null}><ShortlistDock /></Suspense>
        </ShortlistProvider>
      </body>
    </html>
  );
}
