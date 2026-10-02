import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Courier_Prime, Fraunces, Schibsted_Grotesk } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthError } from "@/lib/auth";
import { pageRole } from "@/lib/page-role";
import { Brand } from "@/web/brand";
import { FeedbackWidget } from "@/web/feedback-widget";
import { ServiceWorkerRegistration } from "@/web/pwa-settings";
import "./globals.css";

const sans = Schibsted_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-display", display: "swap" });
// Courier Prime is for ledger data only: prices, counts, dates and the Evidence figures.
// Fraunces italic is the printed voice: course titles, reasons, the masthead. Never body copy.
const serif = Fraunces({ subsets: ["latin", "latin-ext"], style: ["italic"], variable: "--font-serif", display: "swap" });
const mono = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Gluton-Free",
  description: "A Lisbon Restaurant Verdict guide: clear Verdicts, read from what diners write.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Gluton-Free", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F5EFE0" }, { media: "(prefers-color-scheme: dark)", color: "#0F1220" }] };

async function SignedInNavigation() {
  try {
    const role = await pageRole();
    return <>
      <FeedbackWidget />
      <Link href={role === "invitee" ? "/account" : "/settings"}>{role === "invitee" ? "Your data" : "Settings"}</Link>
    </>;
  } catch (error) {
    if (error instanceof AuthError) return null;
    throw error;
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} ${serif.variable}`}>
      <body>
        <ServiceWorkerRegistration />
        <header className="topbar">
          <Brand />
          <span className="tagline">Provisional · Lisboa</span>
          <SignedInNavigation />
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
