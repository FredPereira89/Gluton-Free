"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition, type Ref } from "react";
import { createPortal } from "react-dom";
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
const EVERYDAY_PRICES = ["€", "€€"] as const;

function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((each) => each !== value) : [...values, value];
}

export default function DirectoryControls({ query, neighbourhoods, resultCount, trackUsage = false }: { query: DirectoryQuery; neighbourhoods: { name: string; count: number }[]; resultCount: number; trackUsage?: boolean }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [areaSearch, setAreaSearch] = useState("");
  const [pending, startTransition] = useTransition();
  // The controls show the tap at once; the server-rendered query replaces it when the new view arrives.
  const [shown, showOptimistic] = useOptimistic(query, (current: DirectoryQuery, next: Partial<DirectoryQuery>) => ({ ...current, ...next }));
  const filterDialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const sortSelect = useRef<HTMLSelectElement>(null);
  const activeFilters = Number(shown.tier.length > 0) + Number(shown.family.length > 0) + Number(shown.price.length > 0)
    + Number(shown.area.length > 0) + Number(shown.diet.length > 0) + Number(shown.nee);
  const returnTo = directoryHref(query);

  useEffect(() => {
    const key = `gluton-directory-scroll:${returnTo}`;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(key); sessionStorage.removeItem(key); } catch { return; }
    const y = raw === null ? NaN : Number(raw);
    if (Number.isFinite(y) && y >= 0) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [returnTo]);

  function closeSheet() {
    setSheetOpen(false);
    if (filterDialog.current?.open) filterDialog.current.close();
    filterButton.current?.focus();
  }

  // Match the mobile sheet breakpoint and return to a visible control when resizing to the desktop sidebar.
  useEffect(() => {
    const media = window.matchMedia("(max-width: 999px)");
    const updateViewport = () => {
      setMobileViewport(media.matches);
      if (!media.matches) {
        const dialogWasOpen = filterDialog.current?.open;
        if (dialogWasOpen) filterDialog.current?.close();
        setSheetOpen(false);
        if (dialogWasOpen) requestAnimationFrame(() => sortSelect.current?.focus());
      }
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  // A native modal dialog isolates background controls, traps focus, and closes on Escape.
  useEffect(() => {
    const dialog = filterDialog.current;
    if (!mobileViewport || !sheetOpen || !dialog) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onClose = () => setSheetOpen(false);
    dialog.addEventListener("close", onClose);
    return () => {
      dialog.removeEventListener("close", onClose);
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [mobileViewport, sheetOpen]);

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
    const chosen = shown[name].length;
    // Common desktop filters start open; selected groups remain visible in either layout.
    const open = chosen > 0 || (!mobileViewport && (name === "price" || name === "diet"));
    const normalise = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
    const visibleOptions = name === "area" ? options.filter((option) => normalise(option.label).includes(normalise(areaSearch.trim()))) : options;
    return <details className="dir-group" key={name} open={open}>
      <summary><span>{legend}</span>{chosen > 0 && <span className="dir-group-count">{chosen} chosen</span>}</summary>
      {name === "area" && <label className="dir-area-search">
        <span className="small">Find a neighbourhood</span>
        <input type="search" value={areaSearch} onChange={(event) => setAreaSearch(event.target.value)} />
      </label>}
      <div className={name === "area" ? "dir-options dir-areas" : "dir-options"} role="group" aria-label={legend}>
        {visibleOptions.map((option) => <label key={String(option.value)} className="dir-option">
          <input type="checkbox" checked={(shown[name] as readonly unknown[]).includes(option.value)} onChange={() => pick(name, option.value)} />
          <span>{option.label}</span>
          {option.count !== undefined && <span className="muted small">{option.count}</span>}
        </label>)}
        {visibleOptions.length === 0 && <p className="small muted" role="status">No neighbourhoods match your search.</p>}
      </div>
    </details>;
  }

  const goodOrBetter = shown.tier.length === GOOD_OR_BETTER.length && GOOD_OR_BETTER.every((tier) => shown.tier.includes(tier));
  const everyday = shown.price.length === EVERYDAY_PRICES.length && EVERYDAY_PRICES.every((price) => shown.price.includes(price));
  function quick(label: string, pressed: boolean, onClick: () => void) {
    return <button key={label} type="button" className="dir-chip" aria-pressed={pressed} onClick={onClick}>{label}</button>;
  }

  // Wide screens keep Sort in the sidebar. Below that it moves into the filter sheet, so the first screen is results.
  function sortControl(ref?: Ref<HTMLSelectElement>) {
    return <label className="dir-sort">
      <span className="row-label">Sort by</span>
      <select ref={ref} value={shown.sort} onChange={(event) => {
        const sort = event.target.value as DirectoryQuery["sort"];
        if (sort !== shown.sort) go({ sort }, "sort");
      }}>
        {DIRECTORY_SORTS.map((sort) => <option key={sort} value={sort}>{SORT_LABEL[sort]}</option>)}
      </select>
    </label>;
  }

  const filterOptions = <>
    {group("price", "Price", PRICE_TIERS.map((price) => ({ value: price, label: price })))}
    {group("diet", "Dietary fit", DIETS.map((diet) => ({ value: diet, label: DIET_LABEL[diet] })))}
    {group("area", "Neighbourhood", neighbourhoods.map(({ name, count }) => ({ value: name, label: name, count })))}
    {group("family", "Kind of place", FORMAT_FAMILIES.map((family) => ({ value: family.code, label: family.label })))}
    {group("tier", "Tier", TIERS.map((tier) => ({ value: tier, label: TIER_LABEL[tier] })).reverse())}
    <label className="dir-option dir-nee">
      <input type="checkbox" checked={shown.nee} onChange={() => go({ nee: !shown.nee }, "filter")} />
      <span>Include Restaurants with Not enough evidence</span>
    </label>
    {activeFilters > 0 && <button type="button" className="btn btn-secondary dir-clear" onClick={() => go({ tier: [], family: [], diet: [], price: [], area: [], nee: false }, "filter")}>Clear all filters</button>}
  </>;

  return <div className="dir-controls" aria-busy={pending}>
    <div className="dir-mobile-filter-row">
      <div className="dir-quick" role="group" aria-label="Quick filters">
        {quick("Good or better", goodOrBetter, () => go({ tier: goodOrBetter ? [] : [...GOOD_OR_BETTER] }, "filter"))}
        {quick("€–€€", everyday, () => go({ price: everyday ? [] : [...EVERYDAY_PRICES] }, "filter"))}
        {quick("Traditional Portuguese", shown.family.includes("traditional_portuguese"), () => pick("family", "traditional_portuguese"))}
        {DIETS.map((diet) => quick(DIET_LABEL[diet], shown.diet.includes(diet), () => pick("diet", diet)))}
      </div>
      <button ref={filterButton} type="button" className="dir-chip dir-more" aria-expanded={sheetOpen && mobileViewport} aria-controls="dir-filters" onClick={() => setSheetOpen(true)}>
        Filters &amp; sort{activeFilters ? ` (${activeFilters})` : ""}
      </button>
    </div>
    {sortControl(sortSelect)}
    <div className="dir-filters dir-sidebar">{filterOptions}</div>
    {mobileViewport && createPortal(
      <dialog ref={filterDialog} id="dir-filters" className="dir-mobile-filter-dialog" aria-labelledby="dir-filter-title"
        onClick={(event) => { if (event.target === event.currentTarget) closeSheet(); }}>
        <div className="dir-mobile-filter-sheet">
          <div className="dir-sheet-head">
            <strong id="dir-filter-title">Filters &amp; sort</strong>
            <button ref={closeButton} type="button" className="btn" onClick={closeSheet}>Show {resultCount} {resultCount === 1 ? "result" : "results"}</button>
          </div>
          <p className="small muted" role="status">{resultCount} {resultCount === 1 ? "Restaurant" : "Restaurants"} match these filters.</p>
          {sortControl()}
          {filterOptions}
        </div>
      </dialog>, document.body,
    )}
  </div>;
}
