// The Verdict page: decision-first. A diner reads the Verdict and warning, then strengths and Dietary fit,
// quotes and concise Sources. Method and Owner tools stay available in disclosures. Owner and Invitee read the same report; the Owner alone gets the
// editing tools and questions. Neither sees θ, percentile numbers, SD or Peer-snapshot language.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ASPECT_LABEL, INPUT_LABEL, TIER_LABEL, type Tier } from "@/domain/aspects";
import { formatLabel } from "@/domain/format-labels";
import {
  aspectPositions, changePointNotice, heroSummary, leadStanding, confidenceReasons, consistencyLine, heroReason, missingEvidence,
  peerGroupName, provisionalNotice, redFlagLine, strengthsAndWarnings,
} from "@/verdict/plain-report";
import { formatPercentile } from "@/verdict/peer";
import { type SourceDisagreement, type SourceReading } from "@/verdict/rollup";
import { trendOf } from "@/verdict/trend";
import { ConfChip, dateLabel, DietIcon, Explanation, monthLabel, TierBadge, TrendChip } from "@/web/atoms";
import { ExternalIcon, Icon, Stars } from "@/web/icons";
import { loadRestaurantBundle } from "@/web/data";
import type { InviteeBundle, ReportFacts as ReportFactsData, RestaurantBundle } from "@/lib/api-contract";
import { projectInviteeBundle } from "@/lib/invitee-projection";
import { pageRole } from "@/lib/page-role";
import { InviteeView } from "@/web/invitee-view";
import { Quote } from "@/web/quote";
import { TierLegend } from "@/web/tier-legend";
import { StandingHistoryChart } from "@/web/standing-history";
import { LookupProgress } from "@/web/lookup-progress";
import { RefreshWhileBusy } from "@/web/refresh-while-busy";
import { TheForkLink } from "@/web/thefork-link";
import { TheForkUnavailable } from "@/web/thefork-retry";
import { OwnerQuestions, SourceRetryBanners } from "@/web/owner-questions";
import { ListingUndo } from "@/web/listing-undo";
import { RestaurantFactsEditor } from "@/web/restaurant-facts";
import { ChangePoints } from "@/web/change-points";
import { VerdictFeedback } from "@/web/verdict-feedback";
import { FeedbackWidget } from "@/web/feedback-widget";
import { UsageEventOnMount, UsageTrackedLink } from "@/web/usage-tracking";
import { safeDirectoryReturn } from "@/lib/directory-url";

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ from?: string | string[] }> };

// Both the Owner's bundle and the Invitee projection render through this one page, with the same report.
// What only the Owner has (tools, jobs, questions) is read from `owner`, which is null for an Invitee.
type ReportVerdict = NonNullable<InviteeBundle["verdict"]>;
type RedFlagGroup = ReportVerdict["blocks"]["rollup"]["redFlags"][number];
type SourceLink = { name: string; url: string; access: "public_ok" | "personal_only" };


export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadRestaurantBundle(slug);
  return { title: page ? `${page.restaurant.name} · Gluton-Free` : "Not found" };
}

export default async function VerdictPageRoute({ params, searchParams = Promise.resolve({}) }: Props) {
  await connection();
  const { slug } = await params;
  const [role, loaded, search] = await Promise.all([pageRole(), loadRestaurantBundle(slug), searchParams]);
  if (!loaded) notFound();
  const from = safeDirectoryReturn(typeof search.from === "string" ? search.from : undefined);
  const owner = role === "owner" ? loaded : null;
  const page: RestaurantBundle | InviteeBundle = owner ?? projectInviteeBundle(loaded);
  const { restaurant: R } = page;
  const v: ReportVerdict | null = page.verdict;
  const hasForcingRedFlag = v?.blocks.rollup.redFlags.some((group) => group.forcesAvoid) ?? false;
  const marker = owner ? null : <><InviteeView /><UsageEventOnMount type="report_opened" actionKey={R.slug} /></>;
  const ctx = { format: R.format, city: R.city };
  const crowd = page.sources.filter((s) => s.kind === "crowd");
  const sourceByCode = new Map<string, SourceLink>(page.sources.map((s) => [s.code, s]));
  const activeJob = owner?.activeJob ?? null;

  const head = (
    <div className="name">
      <h1>{R.name}</h1>
      <p>
        {R.address ? `${R.address}, ${R.city}` : [R.area, R.city].filter(Boolean).join(", ")}
        {crowd.map((s) => (
          <span key={s.code}>
            {" · "}
            <a href={s.url} rel="noreferrer nofollow" target="_blank">
              {s.name}&nbsp;<ExternalIcon />
            </a>
          </span>
        ))}
      </p>
    </div>
  );
  // The booking link is the next step after the Verdict, so it sits in the hero's first screen as a capsule.
  const bookLink = R.booking && (
    <UsageTrackedLink className={`book${hasForcingRedFlag ? " book-secondary" : ""}`} track={role === "invitee"} href={R.booking.url} rel="noopener noreferrer" target="_blank">{R.booking.label}<ExternalIcon /></UsageTrackedLink>
  );
  const baseChips = (
    <>
      <span className="chip">{formatLabel(R.format)}{R.formatProvenance === "llm" ? " (proposed)" : ""}</span>
      {R.priceTier && <span className="chip">{R.priceTier}</span>}
    </>
  );
  const historyLink = <p className="small touch"><Link href={`/r/${encodeURIComponent(R.slug)}/history`}>See how this verdict has changed</Link></p>;
  const activity = (
    <>
      <RefreshWhileBusy status={activeJob?.status ?? null} />
      {activeJob?.kind === "refresh" && (activeJob.status === "queued" || activeJob.status === "running") && (
        <div className="banner refresh-banner" role="status" aria-live="polite">
          <span className="spin" aria-hidden="true" />
          <span>{activeJob.newReviews === undefined ? "Finding new Reviews" : `${activeJob.newReviews} new Reviews being read`}</span>
        </div>
      )}
    </>
  );

  if (!v) {
    return (
      <div className="A">{marker}
        <Link className="btn btn-secondary report-back" href={from}>Back to results</Link>
        <section className="hero">
          {head}
          {activeJob?.kind === "lookup" && <LookupProgress jobId={activeJob.id} />}
          {activity}
          <p className="explain">No Verdict yet: the Reviews have not been read.</p>
          {bookLink}
          <div className="chips">{baseChips}</div>
          <ReportFacts facts={page.reportFacts} />
        </section>
        {owner && <SourceRetryBanners slug={R.slug} questions={owner.ownerQuestions} />}
        <Sources page={page} owner={owner} />
        <BundleExtras page={page} owner={owner} />
      </div>
    );
  }

  const r = v.blocks.rollup;
  const notices = (
    <>
      {r.provisional && <p className="notice">{provisionalNotice()}</p>}
      {changePointNotice(r) && <p className="notice">{changePointNotice(r)}</p>}
      {r.tierChange && <p className="small muted">Was {TIER_LABEL[r.tierChange.from]} until {dateLabel(r.tierChange.at)}</p>}
    </>
  );
  const perSource = r.counts.perSource;
  const evidenceSections = (
    <>
      {v.blocks.quotes.length > 0 && (
        <section className="sec">
          <h2>In their words</h2>
          <div className="quotes">
            {v.blocks.quotes.map((q) => {
              const s = sourceByCode.get(q.source);
              return <Quote key={q.reviewId} reviewId={q.reviewId} restaurantSlug={R.slug}
                text={q.text} textEn={q.textEn} lang={q.lang} stars={q.stars}
                sourceName={s?.name ?? q.source} sourceUrl={s?.url ?? null}
                month={monthLabel(q.month)} aspectLabel={ASPECT_LABEL[q.aspect]}
                negative={q.polarity < 0} access={q.access ?? s?.access} readOnly={!owner} />;
            })}
          </div>
        </section>
      )}
      {owner && <SourceRetryBanners slug={R.slug} questions={owner.ownerQuestions} />}
      <Sources page={page} owner={owner} perSource={perSource} sourceReadings={r.sourceReadings} />
    </>
  );

  if (r.state === "not_enough_evidence") {
    const nee = r.notEnoughEvidence;
    return (
      <div className="A">{marker}
        <Link className="btn btn-secondary report-back" href={from}>Back to results</Link>
        <section className="hero">
          {head}
          {activity}
          <div>
            <span className="nee">Not enough evidence</span>
          </div>
          {nee.reasonLine && !changePointNotice(r) && <p className="explain">{nee.reasonLine}</p>}
          <div className="chips">{baseChips}</div>
          <ReportFacts facts={page.reportFacts} />
          {notices}
          <div>
            <h2 className="row-label">What is missing</h2>
            <ul className="missing">
              {missingEvidence(nee).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
          {r.redFlags.map((g) => <RedFlagCallout key={g.group} group={g} sources={sourceByCode} />)}
          {bookLink}
          {role === "invitee" && r.redFlags.length > 0 && (
            <FeedbackWidget kind="restaurant_issue" restaurantSlug={R.slug} buttonLabel="Something wrong? Tell us" />
          )}
          {historyLink}
        </section>
        {owner && v.explanation && (
          <details className="judged">
            <summary>How we judged this</summary>
            <p className="explain"><Explanation text={v.explanation} /></p>
            <Footer createdAt={v.issuedAt} ruleVersion={r.ruleVersion} snapshot={r.peerSnapshot} standings={r.standings} compositeStanding={r.compositeStanding} />
          </details>
        )}
        {evidenceSections}
        <BundleExtras page={page} owner={owner} />
      </div>
    );
  }

  const forced = r.redFlags.some((g) => g.forcesAvoid);
  const positions = forced ? [] : aspectPositions(r, ctx);
  const summary = forced ? null : heroSummary(r, ctx);
  const { strengths, warnings } = strengthsAndWarnings(r);
  const lead = leadStanding(r);
  const maxReviewers = Math.max(1, ...strengths.map((t) => t.reviewers), ...warnings.map((t) => t.reviewers));
  const leadGroup = lead ? peerGroupName(lead, ctx) : null;
  const reasons = confidenceReasons(r.confidence.caps).filter((c) => !(r.provisional && c === provisionalNotice()));
  const consistency = consistencyLine(r.consistencySpread);
  const showChart = !r.provisional && r.series.some((q) => q.compositePercentile != null);
  const names = Object.fromEntries(Array.from(sourceByCode, ([code, s]) => [code, s.name]));
  const highlights = (
    <>
      {summary && <p className="hero-summary">{summary}</p>}
      {!forced && (strengths.length > 0 || warnings.length > 0) && (
        <div className="hero-themes">
          <div className="theme-row">
            <span className="row-label">Reviewers praise</span>
            {strengths.length ? strengths.map((t) => <span key={t.label} className="theme-chip pos">{t.label} <b>{t.reviewers}</b></span>)
              : <span className="small muted">No recurring praise yet</span>}
          </div>
          <div className="theme-row">
            <span className="row-label">Reviewers warn</span>
            {warnings.length ? warnings.map((t) => <span key={t.label} className="theme-chip neg">{t.label} <b>{t.reviewers}</b></span>)
              : <span className="small muted">No recurring criticism</span>}
          </div>
        </div>
      )}
      <ReportFacts facts={page.reportFacts} />
      <TierLegend />
    </>
  );

  return (
    <div className="A">{marker}
      <Link className="btn btn-secondary report-back" href={from}>Back to results</Link>
      <section className="hero">
        {head}
        {activity}
        <div className="tier-row">
          <TierBadge tier={(forced ? "avoid" : r.tier) as Tier} size="lg" dashed={r.provisional} />
          <ConfChip level={r.confidence.level} />
          <details className="confidence-help">
            <summary><span aria-hidden="true">?</span><span className="sr-only">About Confidence</span></summary>
            <p>Confidence describes how likely this Tier is to hold with a different sample of Reviews.</p>
          </details>
        </div>
        {!forced && <p className="explain"><span className="hl">{heroReason(r, ctx)}</span></p>}
        {r.redFlags.map((g) => <RedFlagCallout key={g.group} group={g} sources={sourceByCode} />)}
        {bookLink}
        {notices}
        <div className="chips">
          {baseChips}
          <TrendChip trend={r.provisional ? null : trendOf(r.series, r.confidence.level, new Date())} />
        </div>
        {role === "invitee" && (forced || r.tier === "avoid" || r.redFlags.length > 0) && (
          <FeedbackWidget kind="restaurant_issue" restaurantSlug={R.slug} buttonLabel="Something wrong? Tell us" />
        )}
        {historyLink}
      </section>

      <section className="sec report-highlights" aria-label="Strengths and dietary fit">{highlights}</section>



      {evidenceSections}

      <details className="judged">
        <summary>How we judged this</summary>
        <div className="judged-body">
          <div>
            <h3>Peer group</h3>
            <p className="small">
              {lead && !forced
                ? `Compared with ${lead.peerCount} ${peerGroupName(lead, ctx)}.`
                : forced ? "Recent reviews reporting serious problems decide this Tier directly."
                  : "Not yet compared with other restaurants: judged against general cut-offs."}
            </p>
          </div>
          {positions.length > 0 && (
            <div>
              <h3>Aspect positions</h3>
              {leadGroup && <p className="small muted">Against {leadGroup}</p>}
              <div className="scale muted" aria-hidden="true"><span /><span className="scale-ends"><span>Weaker</span><span>Better</span></span></div>
              <ul className="scorecard">
                {positions.map((l) => (
                  <li key={l.input} className={`score lv-${l.level}${l.counted ? "" : " off"}`}>
                    <span className="score-label">{l.label}</span>
                    <span className="meter" role="img" aria-label={`${l.label}: ${l.phrase} ${l.group}${l.counted ? "" : " (not counted)"}`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= l.level ? "on" : ""} />)}</span>
                    <span className="score-text">{l.counted ? l.phrase : "not counted"}{l.group !== leadGroup && <span className="muted"> {l.group}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!forced && (strengths.length > 0 || warnings.length > 0) && (
            <div>
              <h3>What reviewers raise</h3>
              <div className="cols">
                <div>
                  <h4 className="row-label">Strengths</h4>
                  {strengths.length ? <ThemeBars items={strengths} max={maxReviewers} /> : <p className="small muted">No recurring praise yet.</p>}
                </div>
                <div>
                  <h4 className="row-label">Warnings</h4>
                  {warnings.length ? <ThemeBars items={warnings} max={maxReviewers} negative /> : <p className="small muted">No recurring criticism.</p>}
                </div>
              </div>
            </div>
          )}
          {showChart && <StandingHistoryChart series={r.series} changePointAt={r.changePointAt} />}
          <div>
            <h3>Confidence</h3>
            <div><ConfChip level={r.confidence.level} /></div>
            {reasons.length > 0 && <ul className="small plain-list">{reasons.map((c) => <li key={c}>{c}</li>)}</ul>}
          </div>
          {consistency && <div><h3>Consistency</h3><p className="small">{consistency}</p></div>}
          {r.disagreement && <p className="small muted">{disagreementLine(r.disagreement, names)}</p>}
          {owner && (r.tierHeld || r.floorCap || r.ceilingNote) && (
            <div className="owner-notes">
              <h3>Why this Tier (Owner)</h3>
              {r.tierHeld && <p className="small muted">Tier held until the composite or a floor clearly crosses its boundary.</p>}
              {r.floorCap && <p className="small muted">Capped by a floor: {r.floorCap}.</p>}
              {r.ceilingNote && <p className="small muted">Ceiling: {r.ceilingNote}.</p>}
            </div>
          )}
        </div>
      </details>
      {role === "invitee" && r.state === "verdict" && <VerdictFeedback restaurantSlug={R.slug} verdictId={v.id} />}
      {!owner && <BundleExtras page={page} owner={owner} />}
      {owner && <BundleExtras page={page} owner={owner} />}
    </div>
  );
}

const DIET_LABEL: Record<ReportFactsData["dietaryFits"][number], string> = {
  vegetarian: "Vegetarian options",
  vegan: "Vegan options",
  gluten_free: "Gluten-free options",
};

function ReportFacts({ facts }: { facts: ReportFactsData }) {
  if (!facts.standoutDishes.length && !facts.dietaryFits.length) return null;
  return (
    <section className="report-facts" aria-label="Standout dishes and dietary fit">
      {facts.standoutDishes.length > 0 && (
        <div>
          <h2>Standout dishes</h2>
          <ul>{facts.standoutDishes.map((dish) => (
            <li key={dish.name}>
              <span>{dish.name}</span>
              <span className="small muted">{dish.count} {dish.count === 1 ? "review" : "reviews"}</span>
            </li>
          ))}</ul>
        </div>
      )}
      {facts.dietaryFits.length > 0 && (
        <div>
          <h2>Dietary fit</h2>
          <ul>{facts.dietaryFits.map((diet) => <li key={diet}><DietIcon diet={diet} text={DIET_LABEL[diet]} /></li>)}</ul>
        </div>
      )}
    </section>
  );
}

type ThemeBarItem = { label: string; reviewers: number; text: string };

function ThemeBars({ items, max, negative }: { items: ThemeBarItem[]; max: number; negative?: boolean }) {
  return (
    <ul className={`bars${negative ? " neg" : ""}`}>
      {items.map((t) => (
        <li key={t.label}>
          <span className="bar-label">{t.label}</span>
          <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(6, Math.round((t.reviewers / max) * 100))}%` }} /></span>
          <span className="bar-n small muted">{t.text}</span>
        </li>
      ))}
    </ul>
  );
}

function RedFlagCallout({ group: g, sources }: { group: RedFlagGroup; sources: Map<string, SourceLink> }) {
  return (
    <aside className={`flag ${g.forcesAvoid ? "" : "minor"}`} aria-label={`${g.group === "health" ? "Health" : "Money"} red flag`}>
      <span className="ico" aria-hidden="true"><Icon d="M12 6v7M12 17.5h.01" size={16} /></span>
      <div>
        <b>{redFlagLine(g)}</b>
        <p className="small">
          {g.newestAt ? `Most recent: ${monthLabel(g.newestAt.slice(0, 7))}.` : ""}
          {` ${g.forcesAvoid ? "Recurring recent incidents force Avoid." : "Does not force Avoid; blocks Life Changing."}`}
        </p>
        {(g.incidents?.length ?? 0) > 0 && <details className="flag-evidence">
          <summary>Read reported incidents</summary>
          {(g.incidents ?? []).map((incident) => {
          const source = sources.get(incident.source);
          return (
            <figure className="flag-quote" key={incident.reviewId}>
              {incident.evidence !== undefined && <blockquote>“{incident.evidence}”</blockquote>}
              <figcaption className="small muted">
                {source?.url ? <a href={source.url} rel="noreferrer nofollow" target="_blank">{source.name}</a> : source?.name ?? incident.source}
                {` · ${monthLabel(incident.publishedAt.slice(0, 7))}`}
                {incident.stars !== null && incident.stars !== undefined && <>{" · "}<Stars value={incident.stars} /></>}
              </figcaption>
            </figure>
          );
          })}
        </details>}
      </div>
    </aside>
  );
}

type SourceWindow = { text: number; windowStart: string | null };

function Sources({ page, owner, perSource, sourceReadings }: { page: InviteeBundle; owner: RestaurantBundle | null; perSource?: Record<string, SourceWindow>; sourceReadings?: SourceReading[] }) {
  return (
    <section className="sec">
      <h2>Sources</h2>
      <div className="source-cards">
        {page.sources.map((s) => {
          const w = perSource?.[s.code];
          const reading = sourceReadings?.find((sr) => sr.source === s.code);
          return <article className="source-card" key={s.code}>
            <h3><a href={s.url} rel="noreferrer nofollow" target="_blank">{s.name} <ExternalIcon /></a></h3>
            <p className="small muted">{s.kind === "crowd" ? "Review site" : "Guide or critic"}{reading?.quiet ? " · few recent Reviews" : ""}</p>
            <dl>
              <dt>Reviews at this source</dt><dd>{s.reviewCount?.toLocaleString("en") ?? "—"}</dd>
              <dt>Newest review</dt><dd>{dateLabel(s.newestAt)}</dd>
            </dl>
            <details>
              <summary>Source details</summary>
              <dl>
                <dt>Reviews with text</dt><dd>{s.textCount?.toLocaleString("en") ?? "—"}</dd>
                <dt>Source rating</dt><dd>{s.rating?.toFixed(1) ?? "—"}</dd>
                <dt>Review access</dt><dd>{s.access === "personal_only" ? "Available through this account" : "Publicly available"}</dd>
                <dt>Reviews read for this Verdict</dt><dd>{w ? w.text.toLocaleString("en") : "—"}</dd>
                <dt>Review window began</dt><dd>{w?.windowStart ? dateLabel(w.windowStart) : "—"}</dd>
                {reading?.tier && <><dt>Source-specific read</dt><dd>{TIER_LABEL[reading.tier]}</dd></>}
                <dt>Source status</dt><dd>{s.fetchStatus.replaceAll("_", " ")}</dd>
              </dl>
            </details>
            {owner && s.matchProvenance === "auto_accepted" && (
              <div className="source-undo"><ListingUndo slug={page.restaurant.slug} source={s.code} disabled={owner.activeJob !== null} /></div>
            )}
          </article>;
          })}
      </div>
    </section>
  );
}

function BundleExtras({ page, owner }: { page: InviteeBundle; owner: RestaurantBundle | null }) {
  if (!owner) {
    if (page.changePoints.length === 0) return null;
    return (
      <section className="sec">
        <h2>Changes at this restaurant</h2>
        <div className="ev-list">
          {page.changePoints.map((point) => <div key={point.id}>{point.occurredOn}: {point.description}</div>)}
          <p className="small muted">Only reviews since the newest change count.</p>
        </div>
      </section>
    );
  }
  return (
    <details className="sec owner-section" aria-label="Owner tools">
      <summary className="owner-tools-summary">
        <span>Owner tools</span>
        <span className="small muted">{owner.ownerQuestions.length ? `${owner.ownerQuestions.length} open ${owner.ownerQuestions.length === 1 ? "question" : "questions"}` : "No open questions"}</span>
      </summary>
      <div className="owner-tools-body">
      <h2>Restaurant details</h2>
      <RestaurantFactsEditor slug={page.restaurant.slug} format={page.restaurant.format}
        priceTier={page.restaurant.priceTier} busy={owner.activeJob !== null} />
      {owner.activeJob && (
        <p>Current {owner.activeJob.kind} job: {owner.activeJob.status}{owner.activeJob.step ? ` · ${owner.activeJob.step}` : ""}.</p>
      )}
      <div>
        <h2>Change points</h2>
        <ChangePoints slug={page.restaurant.slug} items={page.changePoints} disabled={owner.activeJob !== null} />
      </div>
      {owner.ownerQuestions.length > 0 && (
        <div>
          <h2>Owner questions</h2>
          <OwnerQuestions slug={page.restaurant.slug} questions={owner.ownerQuestions} />
        </div>
      )}
      {owner?.unavailableSources.map((unavailable) => (
        <TheForkUnavailable key={unavailable.source} slug={page.restaurant.slug} detail={unavailable.detail} />
      ))}
      {owner && !owner.sources.some((s) => s.code === "thefork") && (
        <div>
          <h2>TheFork page</h2>
          <p className="small muted">No TheFork Listing found for this Restaurant.</p>
          <details>
            <summary className="small">Wrong or missing? Add it by hand</summary>
            <TheForkLink slug={page.restaurant.slug} busy={owner.activeJob !== null} />
          </details>
        </div>
      )}
      </div>
    </details>
  );
}

function disagreementLine(d: SourceDisagreement, names: Record<string, string>): string {
  const readings = d.sources.map((s) => `${names[s.source] ?? s.source} reads ${TIER_LABEL[s.tier]}`).join(", ");
  return `${readings} since ${monthLabel(d.since.slice(0, 7))} (${d.textReviews} Reviews)`;
}

function Footer({ createdAt, ruleVersion, snapshot, standings, compositeStanding }: {
  createdAt: string; ruleVersion: string; snapshot?: { id: number; month: string } | null;
  standings?: { input: string; level: string; key: string }[]; compositeStanding?: { percentile: number } | null;
}) {
  return (
    <p className="footnote">
      {snapshot
        ? `Verdict issued ${dateLabel(createdAt)} under rule ${ruleVersion}: ranked against Peer snapshot #${snapshot.id} (${monthLabel(snapshot.month)})${compositeStanding ? `, composite at ${formatPercentile(compositeStanding.percentile)} among Peer composites` : ""}. Levels: ${standings?.map((s) => `${INPUT_LABEL[s.input as keyof typeof INPUT_LABEL]}—${s.level} ${s.key}`).join("; ")}. Reviewers are never identified.`
        : `Provisional Verdict issued ${dateLabel(createdAt)} under rule ${ruleVersion}: judged against default cut-offs, not against other Restaurants of the same Format. Life Changing is not available while provisional. Reviewers are never identified.`}
    </p>
  );
}
