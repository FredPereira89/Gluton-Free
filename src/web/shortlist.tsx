"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SHORTLIST_KEY, SHORTLIST_LIMIT, SHORTLIST_NAMES_KEY, comparisonHref, shortlistNames, shortlistSlugs, slugLabel } from "@/lib/shortlist";
import { CloseIcon } from "@/web/icons";

type Held = { slugs: string[]; names: Record<string, string> };

type Shortlist = {
  slugs: string[];
  full: boolean;
  nameOf: (slug: string) => string;
  /** Adds or removes. The name, when given, is kept so the dock can say which Restaurant each chip is. */
  toggle: (slug: string, name?: string) => void;
  clear: () => void;
};

const ShortlistContext = createContext<Shortlist | null>(null);
const EMPTY: Held = { slugs: [], names: {} };

function parse(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function read(): Held {
  const stored = parse(SHORTLIST_KEY);
  const slugs = Array.isArray(stored) ? shortlistSlugs(stored) : [];
  return { slugs, names: shortlistNames(parse(SHORTLIST_NAMES_KEY), slugs) };
}

function write({ slugs, names }: Held) {
  try {
    if (slugs.length) {
      sessionStorage.setItem(SHORTLIST_KEY, JSON.stringify(slugs));
      sessionStorage.setItem(SHORTLIST_NAMES_KEY, JSON.stringify(names));
    } else {
      sessionStorage.removeItem(SHORTLIST_KEY);
      sessionStorage.removeItem(SHORTLIST_NAMES_KEY);
    }
  } catch {
    // The shortlist then lasts only until the page reloads.
  }
}

/** Holds the diner's shortlist for this tab. It starts empty on the server and fills from the session after mount. */
export function ShortlistProvider({ children }: { children: ReactNode }) {
  const [held, setHeld] = useState<Held>(EMPTY);
  useEffect(() => {
    setHeld(read());
    const sync = (event: StorageEvent) => {
      if (event.key === SHORTLIST_KEY || event.key === SHORTLIST_NAMES_KEY || event.key === null) setHeld(read());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const update = useCallback((change: (current: Held) => Held) => {
    setHeld((current) => {
      const changed = change(current);
      const slugs = shortlistSlugs(changed.slugs);
      const next = { slugs, names: shortlistNames(changed.names, slugs) };
      write(next);
      return next;
    });
  }, []);
  const value = useMemo<Shortlist>(() => ({
    slugs: held.slugs,
    full: held.slugs.length >= SHORTLIST_LIMIT,
    nameOf: (slug) => held.names[slug] ?? slugLabel(slug),
    toggle: (slug, name) => update((current) => current.slugs.includes(slug)
      ? { slugs: current.slugs.filter((each) => each !== slug), names: current.names }
      : { slugs: [...current.slugs, slug], names: name ? { ...current.names, [slug]: name } : current.names }),
    clear: () => update(() => EMPTY),
  }), [held, update]);
  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

export function useShortlist(): Shortlist {
  const context = useContext(ShortlistContext);
  if (!context) throw new Error("useShortlist needs a ShortlistProvider");
  return context;
}

/** A drawn disc: a plus while the Restaurant is off the shortlist, a check once it is on. */
function ShortlistMark({ chosen }: { chosen: boolean }) {
  return <svg className="shortlist-mark" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true" focusable="false">
    <circle cx="14" cy="14" r="12" />
    <path d={chosen ? "M8.5 14.5l3.8 3.8 7.2-8" : "M14 8.5v11M8.5 14h11"} />
  </svg>;
}

/**
 * Adds a Restaurant to the shortlist or takes it off. The name is in the label so a screen reader hears which one.
 * A row carries the icon alone; the Report spells the action out with `labelled`.
 * When the shortlist is full the button stays focusable and says why, rather than going dead.
 */
export function ShortlistButton({ slug, name, labelled = false, className = "" }: { slug: string; name: string; labelled?: boolean; className?: string }) {
  const shortlist = useContext(ShortlistContext);
  // Outside the layout's provider (a bare render of the page) there is no shortlist to add to.
  if (!shortlist) return null;
  const { slugs, full, toggle } = shortlist;
  const chosen = slugs.includes(slug);
  const blocked = full && !chosen;
  const label = chosen ? "Remove from shortlist" : blocked ? "Shortlist full. Remove one to add" : "Add to shortlist";
  return <button type="button" className={`shortlist-btn ${labelled ? "is-labelled" : "is-compact"} ${className}`.trim()} aria-pressed={chosen} aria-disabled={blocked || undefined}
    aria-label={`${label}: ${name}`}
    title={blocked ? `The shortlist holds ${SHORTLIST_LIMIT} Restaurants. Remove one to add another.` : undefined}
    onClick={() => { if (!blocked) toggle(slug, name); }}>
    <ShortlistMark chosen={chosen} />
    {labelled && <span>{chosen ? "On shortlist" : blocked ? "Shortlist full" : "Shortlist"}</span>}
  </button>;
}

/** The bar that follows a diner between results and Reports while they hold a shortlist. */
export function ShortlistDock() {
  const { slugs, full, nameOf, toggle } = useShortlist();
  const pathname = usePathname();
  if (!slugs.length || pathname.startsWith("/compare")) return null;
  const ready = slugs.length >= 2;
  return <aside className="shortlist-dock" aria-label="Shortlist">
    <ul className="shortlist-chips">
      {slugs.map((slug) => <li key={slug} className="shortlist-chip">
        <span className="shortlist-chip-name" title={nameOf(slug)}>{nameOf(slug)}</span>
        <button type="button" aria-label={`Remove ${nameOf(slug)} from shortlist`} onClick={() => toggle(slug)}><CloseIcon /></button>
      </li>)}
    </ul>
    <div className="shortlist-dock-actions">
      <p role="status">
        <strong>{slugs.length} of {SHORTLIST_LIMIT}</strong>
        {!ready && <span>Add one more to compare</span>}
        {full && <span>Full. Remove one to add another</span>}
      </p>
      {ready
        ? <Link className="btn shortlist-compare" href={comparisonHref(slugs)}>Compare {slugs.length}</Link>
        : <span className="btn shortlist-compare" aria-disabled="true">Compare</span>}
    </div>
  </aside>;
}

/** Takes one Restaurant off a comparison. The URL decides what the page shows, so this also updates it. */
export function CompareRemove({ slug, name, slugs, from }: { slug: string; name: string; slugs: string[]; from?: string }) {
  const { toggle, slugs: held } = useShortlist();
  const router = useRouter();
  return <button type="button" className="compare-remove" aria-label={`Remove ${name} from the comparison`} onClick={() => {
    if (held.includes(slug)) toggle(slug);
    const rest = slugs.filter((each) => each !== slug);
    router.replace(rest.length ? comparisonHref(rest, from) : (from ?? "/"), { scroll: false });
  }}>Remove</button>;
}

/** Signing out also ends the shortlist, so the next person on this device starts clean. */
export function SignOutButton() {
  const { clear } = useShortlist();
  return <form action="/api/auth/sign-out" method="post" onSubmit={clear}><button type="submit">Sign out</button></form>;
}
