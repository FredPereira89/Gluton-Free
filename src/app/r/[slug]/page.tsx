// The Verdict page, layout A ("Report"). Provisional: θ on the −2..+2 scale, no Peers, no
// "Over time" section.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { INPUT_LABEL, type FlagType, type Tier } from "@/domain/aspects";
import { THEMES } from "@/domain/themes";
import { PARAMS } from "@/verdict/rollup";
import { ConfChip, Explanation, monthLabel, signed, StripAxis, StripRow, TierBadge } from "@/web/atoms";
import { loadRestaurantBundle } from "@/web/data";
import type { RestaurantBundle } from "@/lib/api-contract";
import { Quote } from "@/web/quote";

type Props = { params: Promise<{ slug: string }> };

const FORMAT_NAME: Record<string, string> = { tasca: "tasca" };
const FLAG_LABEL: Record<FlagType, string> = {
  food_poisoning: "food poisoning",
  hygiene: "hygiene",
  scam_overcharge: "overcharging",
  other_safety: "safety",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateLabel = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Lisbon" }) : "—";

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
      </p>
    </div>
  );
  const baseChips = (
    <>
      <span className="chip">{cap(formatName)}</span>
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
        <BundleExtras page={page} />
      </div>
    );
  }

  const r = v.blocks.rollup;

  if (r.state === "not_enough_evidence") {
    const nee = r.notEnoughEvidence;
    const bars = [
      { ok: nee.textReviews >= PARAMS.minTextReviews, t: "Reviews with text", have: String(nee.textReviews), need: String(PARAMS.minTextReviews) },
      { ok: nee.foodMentions >= PARAMS.minFoodMentions, t: "Reviews that mention the food", have: String(nee.foodMentions), need: String(PARAMS.minFoodMentions) },
      {
        ok: nee.newestAgeMonths !== null && nee.newestAgeMonths <= PARAMS.maxNewestAgeMonths,
        t: "Newest Review",
        have: nee.newestAgeMonths === null ? "none" : `${Math.round(nee.newestAgeMonths)} months ago`,
        need: `within ${PARAMS.maxNewestAgeMonths} months`,
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
            <span className="chip prov">Provisional</span>
          </div>
          {v.explanation && (
            <p className="explain">
              <Explanation text={v.explanation} />
            </p>
          )}
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
        <Sources page={page} />
        <BundleExtras page={page} />
        <Footer createdAt={v.issuedAt} ruleVersion={r.ruleVersion} />
      </div>
    );
  }

  const sourceByCode = new Map(page.sources.map((s) => [s.code, s]));
  const pos = r.themes.filter((t) => t.polarity > 0).slice(0, 6);
  const neg = r.themes.filter((t) => t.polarity < 0).slice(0, 6);
  const maxTheme = Math.max(1, ...r.themes.map((t) => t.count));
  const themeRow = (t: (typeof r.themes)[number]) => (
    <div className={`theme ${t.polarity < 0 ? "neg" : ""}`} key={t.code}>
      <span>{THEMES[t.code].label}</span>
      <span className="n">
        {t.count} · {Math.round(t.share * 100)}%
      </span>
      <div className="bar" style={{ width: `${(t.count / maxTheme) * 100}%` }} />
    </div>
  );

  return (
    <div className="A">
      <section className="hero">
        {head}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 14px", alignItems: "center" }}>
          <TierBadge tier={r.tier as Tier} size="lg" dashed />
        </div>
        <div className="chips">
          {baseChips}
          <ConfChip level={r.confidence.level} />
          <span className="chip prov">Provisional</span>
        </div>
        {v.explanation && (
          <p className="explain">
            <Explanation text={v.explanation} />
          </p>
        )}
        {r.redFlags.map((g) => (
          <div className={`flag ${g.forcesAvoid ? "" : "minor"}`} role="note" key={g.group}>
            <span className="ico" aria-hidden="true">
              !
            </span>
            <b>
              {g.group === "health" ? "Health" : "Money"}: {g.incidents12m} confirmed first-hand{" "}
              {g.incidents12m === 1 ? "incident" : "incidents"} in the last 12 months
            </b>
            <span className="small">
              {g.types.map((t) => FLAG_LABEL[t]).join(", ")}
              {g.newestAt ? `; newest ${monthLabel(g.newestAt.slice(0, 7))}` : ""}.{" "}
              {g.forcesAvoid ? "This forces Avoid." : "Shown for awareness; it does not move the Tier."}
            </span>
          </div>
        ))}
      </section>

      <section className="sec">
        <div className="hd">
          <h2>Where it stands</h2>
          <span className="small muted">
            Composite <span className="mono">{signed(r.composite)}</span>
          </span>
        </div>
        <div>
          {r.inputs.map((s) => (
            <StripRow key={s.input} s={s} formatName={formatName} />
          ))}
          <StripAxis />
        </div>
        <p className="small muted">
          θ on the −2…+2 Review scale; the tick marks 0. Good from {signed(PARAMS.goodCut)}, Must Go from {signed(PARAMS.mustGoCut)}{" "}
          with food ≥ {signed(PARAMS.mustGoFood)} and service ≥ {signed(PARAMS.mustGoService)}. Positions become percentiles once
          other {formatName}s are gathered.
        </p>
        {r.floorCap && <p className="small muted">Capped by a floor: {r.floorCap}.</p>}
        {r.consistencySpread.sd !== null && (
          <p className="small muted">
            Star spread over {r.consistencySpread.windowMonths} months: SD {r.consistencySpread.sd.toFixed(2)} across {r.consistencySpread.n}{" "}
            ratings (shown for information).
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
            {v.blocks.quotes.map((q) => {
              const s = sourceByCode.get(q.source);
              return (
                <Quote
                  key={q.reviewId}
                  text={q.text}
                  textEn={q.textEn}
                  lang={q.lang}
                  stars={q.stars}
                  sourceName={s?.name ?? q.source}
                  sourceUrl={s?.url ?? null}
                  month={monthLabel(q.month)}
                  aspectLabel={INPUT_LABEL[q.aspect]}
                  negative={q.polarity < 0}
                />
              );
            })}
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
        <p className="small muted">
          The same Tier came out in {Math.round(r.confidence.bootstrapShare * 100)}% of {PARAMS.bootstrap} resamples of the Reviews.
        </p>
      </section>

      <Sources page={page} />
      <BundleExtras page={page} />
      <Footer createdAt={v.issuedAt} ruleVersion={r.ruleVersion} />
    </div>
  );
}

function Sources({ page }: { page: RestaurantBundle }) {
  return (
    <section className="sec">
      <h2>Sources</h2>
      <div className="tbl-wrap">
        <table className="src">
          <thead>
            <tr>
              <th>Source</th>
              <th>Access</th>
              <th className="num">Reviews</th>
              <th className="num">With text</th>
              <th className="num">Rating</th>
              <th>Newest</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {page.sources.map((s) => {
              return (
                <tr key={s.code}>
                  <td>
                    <a href={s.url} rel="noreferrer nofollow" target="_blank">
                      {s.name} ↗
                    </a>
                    <div className="small muted">{s.kind === "crowd" ? "Crowd Source" : "Editorial Source"}</div>
                  </td>
                  <td>
                    <span className={`acc ${s.access === "personal_only" ? "personal" : "public"}`}>
                      {s.access === "personal_only" ? "personal-only" : "public-OK"}
                    </span>
                  </td>
                  <td className="num">{s.reviewCount?.toLocaleString("en") ?? "—"}</td>
                  <td className="num">{s.textCount?.toLocaleString("en") ?? "—"}</td>
                  <td className="num">{s.rating?.toFixed(1) ?? "—"}</td>
                  <td>{dateLabel(s.newestAt)}</td>
                  <td>{s.fetchStatus.replaceAll("_", " ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(page.distinctions.length > 0 || page.critics.length > 0) && (
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
  if (!page.activeJob && !page.series.length && !page.changePoints.length && !page.ownerQuestions.length) return null;
  return (
    <section className="sec">
      {page.activeJob && (
        <p>Current {page.activeJob.kind} job: {page.activeJob.status}{page.activeJob.step ? ` · ${page.activeJob.step}` : ""}.</p>
      )}
      {page.series.length > 0 && (
        <div>
          <h2>Over time</h2>
          <ul>{page.series.map((point) => <li key={point.quarter}>{point.quarter}: {point.composite === null ? "Not enough evidence" : signed(point.composite)} · {point.volume} Reviews</li>)}</ul>
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
          <ul>{page.ownerQuestions.map((question) => <li key={question.id}>{question.prompt}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

function Footer({ createdAt, ruleVersion }: { createdAt: string; ruleVersion: string }) {
  return (
    <p className="footnote">
      Provisional Verdict issued {dateLabel(createdAt)} under rule {ruleVersion}: judged against default cut-offs, not against other
      Restaurants of the same Format. Life Changing is not available while provisional. Reviewers are never identified.
    </p>
  );
}
