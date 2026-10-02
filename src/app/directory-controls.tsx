"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { DIETS, DIET_LABEL } from "@/domain/dish-dietary";
import { TIERS, TIER_LABEL } from "@/domain/aspects";
import { FORMAT_FAMILIES } from "@/domain/format-labels";
import { DIRECTORY_SORTS, PRICE_TIERS, type DirectoryQuery } from "@/lib/api-contract";
import { directoryHref } from "@/lib/directory-url";
import { trackUsageEvent } from "@/web/usage-tracking";

const SORT_LABEL: Record<(typeof DIRECTORY_SORTS)[number], string> = {
  tier: "Tier, then Confidence",
  food: "Food",
  value: "Value",
  price: "Price, cheapest first",
  name: "Name",
};

type ListFilter = "tier" | "family" | "price" | "area" | "diet";

// One-tap shortcuts onto the same filters the sheet offers: Good or better is the Tier filter with its three upper Tiers.
const GOOD_OR_BETTER = ["good", "must_go", "life_changing"] as const;

function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((each) => each !== value) : [...values, value];
}

export default function DirectoryControls({ query, neighbourhoods, trackUsage = false }: { query: DirectoryQuery; neighbourhoods: { name: string; count: number }[]; trackUsage?: boolean }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // The controls show the tap at once; the server-rendered query replaces it when the new view arrives.
  const [shown, showOptimistic] = useOptimistic(query, (current: DirectoryQuery, next: Partial<DirectoryQuery>) => ({ ...current, ...next }));
  const sheet = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const activeFilters = shown.tier.length + shown.family.length + shown.price.length + shown.area.length + shown.diet.length + (shown.nee ? 1 : 0);

  function closeSheet() {
    setSheetOpen(false);
    filterButton.current?.focus();
  }

  // The phone sheet is modal: focus moves in, Tab stays inside, Escape closes, the page behind does not scroll.
  useEffect(() => {
    if (!sheetOpen) return;
    closeButton.current?.focus();
    const scrollBefore = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return closeSheet();
      if (event.key !== "Tab" || !sheet.current) return;
      const focusable = [...sheet.current.querySelectorAll<HTMLElement>("button, input, select, [href]")].filter((el) => !el.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = scrollBefore; };
  }, [sheetOpen]);

  // Every change goes into the URL, back on the first page; the server renders the new view.
  function go(next: Partial<DirectoryQuery>, eventType?: "filter" | "sort") {
    if (eventType && trackUsage) trackUsageEvent(eventType);
    startTransition(() => {
      showOptimistic(next);
      router.replace(directoryHref({ ...shown, ...next }, { resetPage: true }), { scroll: false });
    });
  }
  function pick<K extends ListFilter>(name: K, value: DirectoryQuery[K][number]) {
    go({ [name]: toggled<unknown>(shown[name], value) } as Partial<DirectoryQuery>, "filter");
  }
  function group<K extends ListFilter>(name: K, legend: string, options: { value: DirectoryQuery[K][number]; label: string; count?: number }[]) {
    return <fieldset className="dir-group" key={name}>
      <legend>{legend}</legend>
      <div className={name === "area" ? "dir-options dir-areas" : "dir-options"}>
        {options.map((option) => <label key={String(option.value)} className="dir-option">
          <input type="checkbox" checked={(shown[name] as readonly unknown[]).includes(option.value)} onChange={() => pick(name, option.value)} />
          <span>{option.label}</span>
          {option.count !== undefined && <span className="muted small">{option.count}</span>}
        </label>)}
      </div>
    </fieldset>;
  }

  const goodOrBetter = GOOD_OR_BETTER.every((tier) => shown.tier.includes(tier));
  function quick(label: string, pressed: boolean, onClick: () => void) {
    return <button key={label} type="button" className="dir-chip" aria-pressed={pressed} onClick={onClick}>{label}</button>;
  }

  return <div className="dir-controls" aria-busy={pending}>
    <div className="dir-quick" role="group" aria-label="Quick filters">
      {quick("Good or better", goodOrBetter, () => go({ tier: goodOrBetter ? shown.tier.filter((tier) => !GOOD_OR_BETTER.includes(tier as (typeof GOOD_OR_BETTER)[number])) : [...new Set([...shown.tier, ...GOOD_OR_BETTER])] }, "filter"))}
      {DIETS.map((diet) => quick(DIET_LABEL[diet], shown.diet.includes(diet), () => pick("diet", diet)))}
      <button ref={filterButton} type="button" className="dir-chip dir-more" aria-expanded={sheetOpen} aria-controls="dir-filters" onClick={() => setSheetOpen(true)}>
        All filters{activeFilters ? ` (${activeFilters})` : ""}
      </button>
    </div>
    <label className="dir-sort">
      <span className="row-label">Sort by</span>
      <select value={shown.sort} onChange={(event) => {
        const sort = event.target.value as DirectoryQuery["sort"];
        if (sort !== shown.sort) go({ sort }, "sort");
      }}>
        {DIRECTORY_SORTS.map((sort) => <option key={sort} value={sort}>{SORT_LABEL[sort]}</option>)}
      </select>
    </label>
    {sheetOpen && <div className="dir-backdrop" aria-hidden="true" onClick={closeSheet} />}
    <div ref={sheet} id="dir-filters" className={`dir-filters${sheetOpen ? " open" : ""}`} role={sheetOpen ? "dialog" : undefined} aria-modal={sheetOpen ? true : undefined} aria-label="Filters">
      <div className="dir-sheet-head">
        <strong>Filters</strong>
        <button ref={closeButton} type="button" className="btn" onClick={closeSheet}>Show results</button>
      </div>
      {group("tier", "Tier", TIERS.map((tier) => ({ value: tier, label: TIER_LABEL[tier] })).reverse())}
      {group("family", "Format family", FORMAT_FAMILIES.map((family) => ({ value: family.code, label: family.label })))}
      {group("diet", "Dietary fit", DIETS.map((diet) => ({ value: diet, label: DIET_LABEL[diet] })))}
      {group("price", "Price", PRICE_TIERS.map((price) => ({ value: price, label: price })))}
      {group("area", "Neighbourhood", neighbourhoods.map(({ name, count }) => ({ value: name, label: name, count })))}
      <label className="dir-option dir-nee">
        <input type="checkbox" checked={shown.nee} onChange={() => go({ nee: !shown.nee }, "filter")} />
        <span>Show Restaurants with Not enough evidence</span>
      </label>
      {activeFilters > 0 && <button type="button" className="btn btn-secondary dir-clear" onClick={() => go({ tier: [], family: [], diet: [], price: [], area: [], nee: false }, "filter")}>Clear all filters</button>}
    </div>
  </div>;
}
