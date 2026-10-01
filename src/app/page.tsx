import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { AuthError, requireCaller } from "@/lib/auth";
import { directoryQueryFromPage } from "@/lib/directory-url";
import { loadDirectory } from "@/web/data";
import Directory from "./directory";
import SearchHome from "./search-home";

export const metadata: Metadata = {
  title: "Gluton-Free · Lisbon Restaurant Verdicts",
  description: "Clear Verdicts on Lisbon Restaurants, judged against others of their own kind.",
  robots: { index: false, follow: false },
};

function LandingPage() {
  return (
    <div className="public-page landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/">Gluton-Free</Link>
        <Link className="btn landing-sign-in" href="/sign-in">Have an invite? Sign in</Link>
      </header>

      <section className="landing-hero">
        <p className="eyebrow">Lisbon dining · invitation-only beta</p>
        <h1>Choose your next table with confidence.</h1>
        <p className="landing-intro">
          Gluton-Free reads what diners say and turns it into a clear Verdict on Restaurants in Lisbon.
          Each Restaurant is judged against others of its own kind, so a tasca is compared with tascas,
          not with every restaurant in the city.
        </p>
        <div className="landing-facts" aria-label="About Gluton-Free">
          <span>Lisbon only</span>
          <span>Each judged against its own kind</span>
          <span>Invitation-only beta</span>
        </div>
      </section>

      <section className="landing-example" aria-labelledby="example-title">
        <div className="landing-example-heading">
          <div>
            <p className="eyebrow">Fictional example · no real Verdicts are public</p>
            <h2 id="example-title">A sample report</h2>
          </div>
          <span className="example-label">Invented for this page</span>
        </div>
        <article className="sample-report" aria-label="Fictional Restaurant report">
          <div className="sample-report-top">
            <div>
              <p className="sample-report-kind">A fictional Lisbon tasca</p>
              <h3>Casa Imaginária</h3>
            </div>
            <span className="tier t-good">Good</span>
          </div>
          <p className="sample-report-reason">
            Solid choice for its kind. In this invented example, diners praise the simple plates;
            reports about busy-hour waits are mixed.
          </p>
          <div className="sample-report-foot">
            <span className="chip conf-Medium">Medium confidence</span>
            <span className="small muted">Every detail in this report is fictional.</span>
          </div>
        </article>
      </section>

      <footer className="landing-footer">
        <p>Have an Invite link? <Link href="/sign-in">Sign in to Gluton-Free</Link>.</p>
        <p><Link href="/privacy">Read the privacy notice</Link></p>
      </footer>
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  let role: "owner" | "invitee" | null = null;
  try {
    const requestHeaders = new Headers(await headers());
    const caller = await requireCaller(new Request("https://app.local/", { headers: requestHeaders }), "invitee");
    role = caller.role;
  } catch (error) {
    // The public landing page remains available when there is no session or auth is not configured.
    if (!(error instanceof AuthError)) throw error;
  }

  if (!role) return <LandingPage />;
  // The directory's state lives in the URL, so a refresh or a shared link restores it.
  const query = directoryQueryFromPage(await searchParams ?? {});
  const result = await loadDirectory(query);
  return <>
    <SearchHome canAddRestaurant={role === "owner"} initialQuery={query.q} />
    <Directory query={query} result={result} />
  </>;
}
