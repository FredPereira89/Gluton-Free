import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { AuthError, requireCaller } from "@/lib/auth";
import { directoryHref, directoryQueryFromPage, isLookupQuery } from "@/lib/directory-url";
import { TIERS, TIER_MEANING } from "@/domain/aspects";
import { WELCOME_DISMISSED_COOKIE } from "@/domain/welcome";
import { Brand } from "@/web/brand";
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

function LandingPage({ accountDeleted = false }: { accountDeleted?: boolean }) {
  return (
    <div className="public-page landing-page">
      <header className="landing-header">
        <Brand />
        <Link className="btn btn-secondary landing-sign-in" href="/sign-in">Sign in</Link>
      </header>
      {accountDeleted && <p className="account-deleted-notice" role="status">Your account and Invitee data were deleted.</p>}

      <section className="landing-top" aria-labelledby="landing-title">
        <div className="landing-copy">
          <h1 id="landing-title">Know where to <span className="hl-eat">eat</span> in Lisbon.</h1>
          <p className="landing-intro">
            <strong>A Lisbon Restaurant Verdict guide.</strong> Gluton-Free reads what diners say. Restaurants are
            judged against others of the same kind: cafés against cafés, for example.
            {" "}When evidence is too thin, we say “Not enough evidence”.
          </p>
        </div>

        <div className="landing-side">
          <figure className="landing-figure">
            <div className="landing-plate">
              <span className="cut cut-cobalt" aria-hidden="true" />
              <span className="cut cut-tomato" aria-hidden="true" />
              <span className="cut cut-leaf" aria-hidden="true" />
              <Image className="landing-art" src="/lisbon-table.png" alt="Illustration of two grilled sardines on a blue-and-white patterned plate, with lemon, olives, a tomato and a striped napkin." width={1536} height={1024} sizes="(min-width: 900px) 460px, 90vw" priority />
            </div>
            <figcaption>Original illustration. It does not show any listed Restaurant.</figcaption>
          </figure>

          <div className="landing-example">
            <article className="sample-report" aria-labelledby="example-title">
              <h2 id="example-title" className="sr-only">A fictional sample report</h2>
              <p className="example-label">Fictional example. No real Restaurant Verdicts are public.</p>
              <div className="sample-line">
                <h3>Casa Imaginária</h3>
                <i className="leader" aria-hidden="true" />
                <TierBadge tier="good" />
              </div>
              <p className="sample-report-kind">Lisbon tasca · traditional Portuguese restaurant</p>
              <p className="sample-report-reason">
                <span className="hl">Solid choice for its kind.</span> Diners praise the simple plates;
                reports about busy-hour waits are mixed.
              </p>
              <div className="sample-report-foot">
                <ConfChip level="medium" />
              </div>
            </article>
          </div>
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

      <section className="landing-steps-section" aria-labelledby="steps-title">
        <h2 id="steps-title">Choosing in three steps</h2>
        <ol className="landing-steps">
          <li><strong>Find</strong> Search Lisbon, or filter by neighbourhood, price and dietary fit.</li>
          <li><strong>Compare</strong> Shortlist two or three and set them side by side.</li>
          <li><strong>Decide</strong> Read the Verdict and its reason, then book or open the map.</li>
        </ol>
      </section>

      <section className="landing-menu" aria-labelledby="menu-title">
        <h2 id="menu-title">How a Verdict reads</h2>
        <p className="landing-menu-lede">A Verdict gives one Tier, judged against Restaurants of the same kind. Highest first.</p>
        <ol className="ementa tier-menu">
          {[...TIERS].reverse().map((tier) => <li key={tier} className="tier-line">
            <p className="tier-meaning">{TIER_MEANING[tier]}</p>
            <i className="leader" aria-hidden="true" />
            <TierBadge tier={tier} />
          </li>)}
        </ol>
        <p className="landing-menu-note">Not enough evidence means there is no Tier. A dashed outline means the Tier is provisional.</p>
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

  if (!role) {
    const params = await searchParams;
    return <LandingPage accountDeleted={params?.account === "deleted"} />;
  }
  // The directory's state lives in the URL, so a refresh or a shared link restores it.
  const query = directoryQueryFromPage(await searchParams ?? {});
  const defaultQuery = directoryQueryFromPage({});
  const lookupInput = isLookupQuery(query.q);
  const welcomed = (await cookies()).get(WELCOME_DISMISSED_COOKIE) !== undefined;
  const [result, unfilteredResult] = await Promise.all([
    lookupInput ? Promise.resolve(null) : loadDirectory(query),
    !welcomed && directoryHref(query) !== directoryHref(defaultQuery) ? loadDirectory(defaultQuery) : Promise.resolve(null),
  ]);
  const coverage = unfilteredResult ?? result;
  const restaurantsCount = coverage ? coverage.total + coverage.hiddenNotEnoughEvidence : 0;
  return <>
    {!welcomed && <WelcomeCard restaurantsCount={restaurantsCount} />}
    <SearchHome canAddRestaurant={role === "owner"} initialQuery={query.q} trackUsage={role === "invitee"} />
    {!lookupInput && result && <Directory query={query} result={result} trackUsage={role === "invitee"} />}
  </>;
}
