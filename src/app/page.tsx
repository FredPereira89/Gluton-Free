import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { AuthError, requireCaller } from "@/lib/auth";
import { directoryQueryFromPage } from "@/lib/directory-url";
import { TIERS, TIER_MEANING } from "@/domain/aspects";
import { WELCOME_DISMISSED_COOKIE } from "@/domain/welcome";
import { Brand } from "@/web/brand";
import { Masthead } from "@/web/masthead";
import { ConfChip, TierBadge } from "@/web/atoms";
import { loadDirectory } from "@/web/data";
import { WelcomeCard } from "@/web/welcome-card";
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
        <Brand />
        <Link className="btn btn-secondary landing-sign-in" href="/sign-in">Sign in</Link>
      </header>

      <Masthead />

      <section className="landing-top" aria-labelledby="landing-title">
        <div className="landing-copy">
          <h1 id="landing-title">Know where to <span className="hl-eat">eat</span> in Lisbon.</h1>
          <p className="landing-intro">
            Gluton-Free reads what diners say and gives each Lisbon Restaurant one clear Verdict,
            judged against others of its own kind: a tasca against tascas, not the whole city.
          </p>
        </div>

        <div className="landing-example">
          <article className="sample-report" aria-labelledby="example-title">
            <h2 id="example-title" className="sr-only">A sample report</h2>
            <div className="sample-line">
              <h3>Casa Imaginária</h3>
              <i className="leader" aria-hidden="true" />
              <TierBadge tier="good" />
            </div>
            <p className="sample-report-kind">A fictional Lisbon tasca</p>
            <p className="sample-report-reason">
              <span className="hl">Solid choice for its kind.</span> In this invented example, diners praise the simple plates;
              reports about busy-hour waits are mixed.
            </p>
            <div className="sample-report-foot">
              <div className="sample-report-conf">
                <ConfChip level="medium" />
                <span className="small muted">Every detail in this report is fictional. No real Verdicts are public.</span>
              </div>
              <span className="stamp" aria-hidden="true">Not a real Verdict</span>
            </div>
          </article>
          <p className="example-label">Fictional example · invented for this page</p>
        </div>

        <div className="landing-actions">
          <Link className="btn landing-cta" href="/sign-in">Sign in with your invite</Link>
          <ul className="landing-facts" aria-label="About Gluton-Free">
            <li>Lisbon only</li>
            <li>Each judged against its own kind</li>
            <li>Invitation-only beta</li>
          </ul>
        </div>
      </section>

      <section className="landing-menu" aria-labelledby="menu-title">
        <h2 id="menu-title">How a Verdict reads</h2>
        <p className="landing-menu-lede">Every Restaurant gets one Tier, judged against its own kind. Highest first.</p>
        <ol className="ementa tier-menu">
          {[...TIERS].reverse().map((tier) => <li key={tier} className="tier-line">
            <p className="tier-meaning">{TIER_MEANING[tier]}</p>
            <i className="leader" aria-hidden="true" />
            <TierBadge tier={tier} />
          </li>)}
        </ol>
        <p className="landing-menu-note">A dashed outline means the Tier is provisional.</p>
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
  const welcomed = (await cookies()).get(WELCOME_DISMISSED_COOKIE) !== undefined;
  return <>
    {!welcomed && <WelcomeCard />}
    <Masthead />
    <SearchHome canAddRestaurant={role === "owner"} initialQuery={query.q} trackUsage={role === "invitee"} />
    <Directory query={query} result={result} trackUsage={role === "invitee"} />
  </>;
}
