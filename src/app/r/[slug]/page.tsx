// The Verdict page, layout A ("Report"). Provisional: θ on the −2..+2 scale, no Peers.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ASPECT_LABEL, INPUT_LABEL, TIER_LABEL, type FlagType, type Tier } from "@/domain/aspects";
import { THEMES } from "@/domain/themes";
import { formatPercentile } from "@/verdict/peer";
import { PARAMS, type RedFlagGroup, type SourceDisagreement, type SourceReading } from "@/verdict/rollup";
import { ConfChip, dateLabel, Explanation, monthLabel, PeerStripAxis, PeerStripRow, signed, StripAxis, StripRow, TierBadge } from "@/web/atoms";
import { loadRestaurantBundle } from "@/web/data";
import type { RestaurantBundle } from "@/lib/api-contract";
import { Quote } from "@/web/quote";
import { CompositeHistoryChart, SourceHistoryChart } from "@/web/source-history";
import { LookupProgress } from "@/web/lookup-progress";
import { OwnerQuestions } from "@/web/owner-questions";

type Props = { params: Promise<{ slug: string }> };

const FORMAT_NAME: Record<string, string> = { tasca: "tasca" };
const FLAG_LABEL: Record<FlagType, string> = {
  food_poisoning: "food poisoning",
  hygiene: "hygiene",
  scam_overcharge: "overcharging",
  other_safety: "safety",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadRestaurantBundle(slug);
  return { title: page ? `${page.restaurant.name} · Gluton-Free` : "Not found" };
}

export default async function VerdictPageRoute({ params }: Props) {
  await connection();
  const { slug } = await params;
  const page = await loadRestaurantBundle(slug);
  if (!page) notFound();
  const { restaurant: R, verdict: v } = page;
  const formatName = FORMAT_NAME[R.format] ?? R.format;
  const crowd = page.sources.filter((s) => s.kind === "crowd");

  const head = (
    <div className="name">
      <h1>{R.name}</h1>
      <p>
        {[R.area, R.city].filter(Boolean).join(", ")}
        {crowd.map((s) => (
          <span key={s.code}>
            {" · "}
            <a href={s.url} rel="noreferrer nofollow" target="_blank">
              {s.name} ↗
            </a>
          </span>
        ))}
        {" · "}
        <Link href={`/r/${encodeURIComponent(R.slug)}/history`}>Verdict history</Link>
      </p>
    </div>
  );
  const baseChips = (
    <>
      <span className="chip">{cap(formatName)}{R.formatProvenance === "llm" ? " (proposed)" : ""}</span>
      {R.priceTier && <span className="chip">{R.priceTier}</span>}
    </>
  );

  if (!v) {
    return (
      <div className="A">
        <section className="hero">
          {head}
          <div className="chips">{baseChips}</div>
          <p className="explain">No Verdict yet: the Reviews have not been read.</p>
        </section>
        <Sources page={page} />
        {page.activeJob?.kind === "lookup" && <LookupProgress jobId={page.activeJob.id} />}
        <BundleExtras page={page} />
      </div>
    );
  }

  const r = v.blocks.rollup;
  const tierChange = r.tierChange && <p className="small muted">Was {TIER_LABEL[r.tierChange.from]} until {dateLabel(r.tierChange.at)}</p>;
  const perSource = r.counts.perSource;
  const sourceByCode = new Map(page.sources.map((s) => [s.code, s]));

  if (r.state === "not_enough_evidence") {
    const nee = r.notEnoughEvidence;
    const evidenceBars = nee.bars ?? {
      textReviews: { have: nee.textReviews, need: PARAMS.minTextReviews, met: nee.textReviews >= PARAMS.minTextReviews },
      foodMentions: { have: nee.foodMentions, need: PARAMS.minFoodMentions, met: nee.foodMentions >= PARAMS.minFoodMentions },
      newestReview: { have: nee.newestAgeMonths, need: PARAMS.maxNewestAgeMonths, met: nee.newestAgeMonths !== null && nee.newestAgeMonths <= PARAMS.maxNewestAgeMonths },
    };
    const bars = [
      { ok: evidenceBars.textReviews.met, t: "Reviews with text", have: String(evidenceBars.textReviews.have), need: String(evidenceBars.textReviews.need) },
      { ok: evidenceBars.foodMentions.met, t: "Reviews that mention the food", have: String(evidenceBars.foodMentions.have), need: String(evidenceBars.foodMentions.need) },
      {
        ok: evidenceBars.newestReview.met,
        t: "Newest Review",
        have: evidenceBars.newestReview.have === null ? "none" : `${Math.ceil(evidenceBars.newestReview.have)} months ago`,
        need: `within ${evidenceBars.newestReview.need} months`,
      },
    ];
    return (
      <div className="A">
        <section className="hero">
          {head}
          <div>
            <span className="nee">Not enough evidence</span>
          </div>
          <div className="chips">
            {baseChips}
            {r.provisional && <span className="chip prov">Provisional</span>}
          </div>
          {nee.reasonLine && <p className="explain">{nee.reasonLine}</p>}
          {v.explanation && (
            <p className="explain">
              <Explanation text={v.explanation} />
            </p>
          )}
          {r.redFlags.map((g) => <RedFlagCallout key={g.group} group={g} sources={sourceByCode} />)}
          <div>
            {bars.map((b) => (
              <div className="check" key={b.t}>
                <span className={b.ok ? "ok" : "no"}>{b.ok ? "✓" : "✗"}</span>
                <span>{b.t}</span>
                <span className="mono small">
                  {b.have} <span className="muted">/ {b.need}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
        <Sources page={page} perSource={perSource} sourceReadings={r.sourceReadings} />
        <BundleExtras page={page} />
        <Footer createdAt={v.issuedAt} ruleVersion={r.ruleVersion} snapshot={r.peerSnapshot} standings={r.standings} compositeStanding={r.compositeStanding} />
      </div>
    );
  }

  const forcedFlags = r.redFlags.filter((g) => g.forcesAvoid);
  if (forcedFlags.length) {
    return (
      <div className="A">
        <section className="hero">
          {head}
          <TierBadge tier="avoid" size="lg" dashed={r.provisional} />
          {tierChange}
          {r.redFlags.map((g) => <RedFlagCallout key={g.group} group={g} sources={sourceByCode} />)}
        </section>
        <Sources page={page} perSource={perSource} sourceReadings={r.sourceReadings} hideExtras />
      </div>
    );
  }
  const pos = r.themes.filter((t) => t.polarity > 0).slice(0, 6);
  const neg = r.themes.filter((t) => t.polarity < 0).slice(0, 6);
  const maxTheme = Math.max(1, ...r.themes.map((t) => t.count));
  const foodStanding = r.standings?.find((s) => s.input === "food");
  const peerGroupLabel = foodStanding?.level === "family" ? `${cap(foodStanding.key.replaceAll("_", " "))} Restaurants`
    : foodStanding?.level === "city" ? "Lisbon Restaurants" : `${formatName}s`;
  const onePeerGroup = r.standings?.filter((s) => r.inputs.find((i) => i.input === s.input)?.counted)
    .every((s) => s.level === foodStanding?.level && s.key === foodStanding.key && s.peerCount === foodStanding.peerCount);
  const themeRow = (t: (typeof r.themes)[number]) => (
    <div className={`theme ${t.polarity < 0 ? "neg" : ""}`} key={t.code}>
      <span>{THEMES[t.code].label}</span>
      <span className="n">
        {t.count} · {Math.round(t.share * 100)}%
      </span>
      <div className="bar" style={{ width: `${(t.count / maxTheme) * 100}%` }} />
    </div>
  );
  const quoteCard = (q: (typeof v.blocks.quotes)[number]) => {
    const s = sourceByCode.get(q.source);
    return <Quote key={q.reviewId} reviewId={q.reviewId} restaurantSlug={R.slug}
      text={q.text} textEn={q.textEn} lang={q.lang} stars={q.stars}
      sourceName={s?.name ?? q.source} sourceUrl={s?.url ?? null}
      month={monthLabel(q.month)} aspectLabel={ASPECT_LABEL[q.aspect]}
      negative={q.polarity < 0} access={q.access ?? s?.access} />;
  };

  return (
    <div className="A">
      <section className="hero">
        {head}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 14px", alignItems: "center" }}>
          <TierBadge tier={r.tier as Tier} size="lg" dashed={r.provisional} />
        </div>
        {tierChange}
        {r.tierHeld && <p className="small muted">Tier held until the composite or a floor clearly crosses its boundary.</p>}
        <div className="chips">
          {baseChips}
          <ConfChip level={r.confidence.level} />
          {r.provisional && <span className="chip prov">Provisional</span>}
        </div>
        {v.explanation && (
          <p className="explain">
            <Explanation text={v.explanation} />
          </p>
        )}
        {r.redFlags.map((g) => <RedFlagCallout key={g.group} group={g} sources={sourceByCode} />)}
      </section>

      <section className="sec">
        <div className="hd">
          <h2>{r.peerSnapshot ? onePeerGroup ? `Where it stands among ${foodStanding?.peerCount ?? 0} ${peerGroupLabel}` : "Where it stands among Peers" : "Where it stands"}</h2>
          <span className="small muted">
            Composite <span className="mono">{signed(r.composite)}</span>
            {r.compositeStanding && <> · <span className="mono">{formatPercentile(r.compositeStanding.percentile)}</span> among Peer composites</>}
          </span>
        </div>
        <div>
          {r.inputs.map((s) => {
            const themes = r.themes.filter((t) => t.aspect === s.input);
            const quotes = v.blocks.quotes.filter((q) => q.aspect === s.input);
            return <details className="standing-detail" key={s.input}>
              <summary aria-label={`Show ${INPUT_LABEL[s.input]} Themes and quotes`}>
                {r.peerSnapshot
                  ? <PeerStripRow s={s} standing={r.standings?.find((p) => p.input === s.input)} floor={r.tierFloors?.find((f) => f.input === s.input)?.percentile} formatName={formatName} />
                  : <StripRow s={s} formatName={formatName} />}
              </summary>
              <div className="standing-evidence">
                <h3>{INPUT_LABEL[s.input]} Themes and quotes</h3>
                {themes.map(themeRow)}
                {quotes.map(quoteCard)}
                {!themes.length && !quotes.length && <p className="small muted">No Themes or quotes yet.</p>}
              </div>
            </details>;
          })}
          {r.peerSnapshot ? <PeerStripAxis /> : <StripAxis />}
        </div>
        {!r.peerSnapshot && <p className="small muted">
          θ on the −2…+2 Review scale; the tick marks 0. Good from {signed(PARAMS.goodCut)}, Must Go from {signed(PARAMS.mustGoCut)}{" "}
          with food ≥ {signed(PARAMS.mustGoFood)} and service ≥ {signed(PARAMS.mustGoService)}. Positions become percentiles once
          other {formatName}s are gathered.
        </p>}
        {r.floorCap && <p className="small muted">Capped by a floor: {r.floorCap}.</p>}
        {r.ceilingNote && <p className="small muted">Ceiling: {r.ceilingNote}.</p>}
        {r.consistencySpread.sd !== null && (
          <p className="small muted">
            Consistency (spread of stance) over {r.consistencySpread.windowMonths} months: SD {r.consistencySpread.sd.toFixed(2)} across{" "}
            {r.consistencySpread.n} Reviews (shown for information).
          </p>
        )}
      </section>

      {r.themes.length > 0 && (
        <section className="sec">
          <h2>What people say</h2>
          <div className="cols">
            <div>
              <div className="eyebrow">Praised</div>
              {pos.map(themeRow)}
            </div>
            <div>
              <div className="eyebrow">Criticised</div>
              {neg.length ? neg.map(themeRow) : <p className="small muted">No recurring criticism.</p>}
            </div>
          </div>
          <p className="small muted">
            Share of {r.themeBase.analysed.toLocaleString("en")} text Reviews
            {r.themeBase.windowMonths ? ` from the last ${r.themeBase.windowMonths} months` : ""} that mention each theme.
          </p>
        </section>
      )}

      {v.blocks.quotes.length > 0 && (
        <section className="sec">
          <h2>In their words</h2>
          <div className="quotes">
            {v.blocks.quotes.map(quoteCard)}
          </div>
        </section>
      )}

      <section className="sec">
        <h2>Confidence</h2>
        <div>
          <ConfChip level={r.confidence.level} />
        </div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {r.confidence.caps.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        {r.provisional && <p className="small muted">
          The same Tier came out in {Math.round(r.confidence.bootstrapShare * 100)}% of {PARAMS.bootstrap} resamples of the Reviews.
        </p>}
      </section>

      <Sources page={page} perSource={perSource} sourceReadings={r.sourceReadings} />
      <BundleExtras page={page} />
      <Footer createdAt={v.issuedAt} ruleVersion={r.ruleVersion} snapshot={r.peerSnapshot} standings={r.standings} compositeStanding={r.compositeStanding} />
    </div>
  );
}

function RedFlagCallout({ group: g, sources }: { group: RedFlagGroup; sources: Map<string, RestaurantBundle["sources"][number]> }) {
  return (
    <aside className={`flag ${g.forcesAvoid ? "" : "minor"}`} aria-label={`${g.group === "health" ? "Health" : "Money"} red flag`}>
      <span className="ico" aria-hidden="true">!</span>
      <div>
        <b>Red flag · {g.group === "health" ? "Health" : "Money"}: {g.incidents12m} verified first-hand {g.incidents12m === 1 ? "incident" : "incidents"}</b>
        <p className="small">
          {g.types.map((t) => FLAG_LABEL[t]).join(", ")}; newest {g.newestAt ? monthLabel(g.newestAt.slice(0, 7)) : "unknown"}.{" "}
          {g.forcesAvoid ? "Recurring recent incidents force Avoid." : "Does not force Avoid; blocks Life Changing."}
        </p>
        {(g.incidents ?? []).map((incident) => {
          const source = sources.get(incident.source);
          return (
            <figure className="flag-quote" key={incident.reviewId}>
              <blockquote>“{incident.evidence}”</blockquote>
              <figcaption className="small muted">
                {source ? <a href={source.url} rel="noreferrer nofollow" target="_blank">{source.name}</a> : incident.source}
                {` · ${monthLabel(incident.publishedAt.slice(0, 7))}`}
                {incident.stars !== null && incident.stars !== undefined && <span className="stars" aria-label={`${incident.stars} stars`}>{` · ${"★".repeat(incident.stars)}${"☆".repeat(5 - incident.stars)}`}</span>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </aside>
  );
}

type SourceWindow = { text: number; windowStart: string | null };

function Sources({ page, perSource, sourceReadings, hideExtras = false }: { page: RestaurantBundle; perSource?: Record<string, SourceWindow>; sourceReadings?: SourceReading[]; hideExtras?: boolean }) {
  return (
    <section className="sec">
      <h2>Sources</h2>
      <p className="small muted">Source ratings, Review counts and Distinctions are facts about each Source, not a Verdict.</p>
      <div className="tbl-wrap">
        <table className="src">
          <thead>
            <tr>
              <th>Source</th>
              <th>Access</th>
              <th className="num">Reviews</th>
              <th className="num">With text</th>
              <th className="num">Rating</th>
              <th>Tier reading</th>
              <th>Newest</th>
              <th className="num">Window</th>
              <th>Window since</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {page.sources.map((s) => {
              const w = perSource?.[s.code];
              const reading = sourceReadings?.find((sr) => sr.source === s.code);
              return (
                <tr key={s.code}>
                  <td>
                    <a href={s.url} rel="noreferrer nofollow" target="_blank">
                      {s.name} ↗
                    </a>
                    <div className="small muted">{s.kind === "crowd" ? "Crowd Source" : "Editorial Source"}{reading?.quiet && " · quiet"}</div>
                  </td>
                  <td>
                    <span className={`acc ${s.access === "personal_only" ? "personal" : "public"}`}>
                      {s.access === "personal_only" ? "personal-only" : "public-OK"}
                    </span>
                  </td>
                  <td className="num">{s.reviewCount?.toLocaleString("en") ?? "—"}</td>
                  <td className="num">{s.textCount?.toLocaleString("en") ?? "—"}</td>
                  <td className="num">{s.rating?.toFixed(1) ?? "—"}</td>
                  <td>{reading?.tier ? TIER_LABEL[reading.tier] : "—"}</td>
                  <td>{dateLabel(s.newestAt)}</td>
                  <td className="num">{w ? w.text.toLocaleString("en") : "—"}</td>
                  <td>{w?.windowStart ? dateLabel(w.windowStart) : "—"}</td>
                  <td>{s.fetchStatus.replaceAll("_", " ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!hideExtras && (page.distinctions.length > 0 || page.critics.length > 0) && (
        <div className="ev-list">
          {page.distinctions.map((d) => (
            <div key={d.url}>
              <b>{d.guide}</b> · {d.level}
              {d.editionYear ? ` (${d.editionYear})` : ""}{" "}
              <a href={d.url} rel="noreferrer" target="_blank">
                ↗
              </a>
            </div>
          ))}
          {page.critics.map((c) => (
            <div key={c.url}>
              <b>{c.publication}</b> ·{" "}
              <a href={c.url} rel="noreferrer" target="_blank">
                “{c.title}” ↗
              </a>
              {c.publishedOn ? ` (${c.publishedOn.slice(0, 4)})` : ""}
            </div>
          ))}
          <p className="small muted">Shown for context; Distinctions and critic pieces never move the Tier.</p>
        </div>
      )}
    </section>
  );
}

function BundleExtras({ page }: { page: RestaurantBundle }) {
  const r = page.verdict?.blocks.rollup;
  const history = r?.sourceHistory ?? [];
  const showComposite = !!r && !r.provisional && r.series.some((q) => q.compositePercentile != null);
  const disagreement = r?.disagreement;
  if (!page.activeJob && !page.series.length && !history.length && !page.changePoints.length && !page.ownerQuestions.length && !showComposite && !disagreement) return null;
  const names = Object.fromEntries(page.sources.map((s) => [s.code, s.name]));
  return (
    <section className="sec">
      {page.activeJob && (
        <p>Current {page.activeJob.kind} job: {page.activeJob.status}{page.activeJob.step ? ` · ${page.activeJob.step}` : ""}.</p>
      )}
      {showComposite && <CompositeHistoryChart series={r!.series} changePointAt={r!.changePointAt} />}
      {disagreement && <p className="small muted">{disagreementLine(disagreement, names)}</p>}
      {history.length > 0 && <SourceHistoryChart history={history} names={names} />}
      {history.length === 0 && page.series.length > 0 && (
        <div>
          <h2>Review volume over time</h2>
          <ul>{page.series.map((point) => <li key={point.quarter}>{point.quarter}: {point.volume} Reviews, {point.textVolume} with text</li>)}</ul>
        </div>
      )}
      {page.changePoints.length > 0 && (
        <div>
          <h2>Change points</h2>
          <ul>{page.changePoints.map((point) => <li key={point.occurredOn}>{point.occurredOn}: {point.description}</li>)}</ul>
        </div>
      )}
      {page.ownerQuestions.length > 0 && (
        <div>
          <h2>Owner questions</h2>
          <OwnerQuestions slug={page.restaurant.slug} questions={page.ownerQuestions} />
        </div>
      )}
    </section>
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
