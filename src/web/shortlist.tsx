"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { SHORTLIST_KEY, SHORTLIST_LIMIT, comparisonHref, shortlistSlugs } from "@/lib/shortlist";

type Shortlist = {
  slugs: string[];
  full: boolean;
  toggle: (slug: string) => void;
  clear: () => void;
};

const ShortlistContext = createContext<Shortlist | null>(null);

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(SHORTLIST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? shortlistSlugs(parsed) : [];
  } catch {
    return [];
  }
}

function write(slugs: string[]) {
  try {
    if (slugs.length) sessionStorage.setItem(SHORTLIST_KEY, JSON.stringify(slugs));
    else sessionStorage.removeItem(SHORTLIST_KEY);
  } catch {
    // The shortlist then lasts only until the page reloads.
  }
}

/** Holds the diner's shortlist for this tab. It starts empty on the server and fills from the session after mount. */
export function ShortlistProvider({ children }: { children: ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  useEffect(() => {
    setSlugs(read());
    const sync = (event: StorageEvent) => { if (event.key === SHORTLIST_KEY || event.key === null) setSlugs(read()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const update = useCallback((change: (current: string[]) => string[]) => {
    setSlugs((current) => {
      const next = shortlistSlugs(change(current));
      write(next);
      return next;
    });
  }, []);
  const value = useMemo<Shortlist>(() => ({
    slugs,
    full: slugs.length >= SHORTLIST_LIMIT,
    toggle: (slug) => update((current) => (current.includes(slug) ? current.filter((each) => each !== slug) : [...current, slug])),
    clear: () => update(() => []),
  }), [slugs, update]);
  return <ShortlistContext.Provider value={value}>{children}</ShortlistContext.Provider>;
}

export function useShortlist(): Shortlist {
  const context = useContext(ShortlistContext);
  if (!context) throw new Error("useShortlist needs a ShortlistProvider");
  return context;
}

/** Adds a Restaurant to the shortlist or takes it off. The name is in the label so a screen reader hears which one. */
export function ShortlistButton({ slug, name, className = "" }: { slug: string; name: string; className?: string }) {
  const shortlist = useContext(ShortlistContext);
  // Outside the layout's provider (a bare render of the page) there is no shortlist to add to.
  if (!shortlist) return null;
  const { slugs, full, toggle } = shortlist;
  const chosen = slugs.includes(slug);
  const blocked = full && !chosen;
  return <button type="button" className={`shortlist-btn ${className}`} aria-pressed={chosen} disabled={blocked}
    aria-label={`${chosen ? "Remove from shortlist" : "Add to shortlist"}: ${name}`}
    title={blocked ? `The shortlist holds ${SHORTLIST_LIMIT} Restaurants. Remove one to add another.` : undefined}
    onClick={() => toggle(slug)}>
    <span className="shortlist-mark" aria-hidden="true" />
    <span>{chosen ? "On shortlist" : blocked ? "Shortlist full" : "Shortlist"}</span>
  </button>;
}

/** The bar that follows a diner between results and Reports while they hold a shortlist. */
export function ShortlistDock() {
  const { slugs, clear } = useShortlist();
  const pathname = usePathname();
  if (!slugs.length || pathname.startsWith("/compare")) return null;
  const ready = slugs.length >= 2;
  return <aside className="shortlist-dock" aria-label="Shortlist">
    <p role="status">
      <strong>{slugs.length} of {SHORTLIST_LIMIT}</strong>
      <span>{ready ? " on your shortlist" : " on your shortlist. Add one more to compare."}</span>
    </p>
    <div className="shortlist-dock-actions">
      <button type="button" className="shortlist-clear" onClick={clear}>Clear</button>
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
