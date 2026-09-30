import { isFoodCategoryId } from "@/domain/baseline-format";

const BASE = "https://api.dataforseo.com/v3/business_data/business_listings";
const PAGE_SIZE = 1_000;
const CATEGORIES_PER_REQUEST = 10;
const LISBON_CIRCLE = "38.7223,-9.1393,15";
// July 2026 rates: 20% above $0.012/task + $0.00036/item, with at most 1,000 items.
const MAX_SEARCH_PAGE_COST_USD = 0.4464;

type Envelope = {
  status_code?: number;
  tasks?: {
    status_code?: number;
    cost?: number;
    result?: unknown[] | null;
  }[];
};

export type BusinessListing = {
  type?: string;
  place_id?: string | null;
  title?: string | null;
  url?: string | null;
  address?: string | null;
  address_info?: { borough?: string | null; district?: string | null; city?: string | null } | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  category_ids?: string[] | null;
  additional_categories?: string[] | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
  price_level?: string | null;
  work_hours?: { current_status?: string | null } | null;
  work_time?: { work_hours?: { current_status?: string | null } | null } | null;
};

export type BusinessListingPage = {
  items: BusinessListing[];
  offsetToken: string | null;
  costUsd: number;
};

export type VendorCostCallback = (costUsd: number) => void | Promise<void>;
export type VendorCostReservation = (maximumUsd: number) => Promise<(actualUsd: number) => Promise<void>>;

function authorization(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials are not set");
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

async function request(path: string, body?: unknown): Promise<Envelope> {
  const response = await fetch(`${BASE}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: authorization(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const envelope = await response.json().catch(() => null) as Envelope | null;
  if (!response.ok || !envelope || envelope.status_code !== 20000) {
    throw new Error(`DataForSEO Business Listings request failed (HTTP ${response.status})`);
  }
  return envelope;
}

function taskFrom(envelope: Envelope) {
  const task = envelope.tasks?.[0];
  if (!task || task.status_code !== 20000) throw new Error("DataForSEO Business Listings returned no results");
  return task;
}

/** DataForSEO's free category registry lets the sweep cover its supported food categories. */
async function foodCategories(): Promise<string[]> {
  const task = taskFrom(await request("categories"));
  const categories = (task.result ?? []).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const name = (row as { category_name?: unknown }).category_name;
    return typeof name === "string" && isFoodCategoryId(name) ? [name] : [];
  });
  if (!categories.length) throw new Error("DataForSEO returned no supported food categories");
  return [...new Set(categories)].sort();
}

async function searchPage(
  categories: string[],
  offsetToken: string | undefined,
  onCost?: VendorCostCallback,
  reserveCost?: VendorCostReservation,
): Promise<BusinessListingPage> {
  const body = [{
    categories,
    location_coordinate: LISBON_CIRCLE,
    limit: PAGE_SIZE,
    ...(offsetToken ? { offset_token: offsetToken } : {}),
  }];
  const settle = await reserveCost?.(MAX_SEARCH_PAGE_COST_USD);
  let task: ReturnType<typeof taskFrom>;
  try {
    task = taskFrom(await request("search/live", body));
  } catch (error) {
    await settle?.(0);
    throw error;
  }
  const costUsd = task.cost ?? 0;
  await settle?.(costUsd);
  await onCost?.(costUsd);
  const result = task.result?.[0] as { items?: BusinessListing[]; offset_token?: unknown } | undefined;
  const token = typeof result?.offset_token === "string" ? result.offset_token : null;
  return {
    items: (result?.items ?? []).filter((item) => item.type === "business_listing"),
    offsetToken: token,
    costUsd,
  };
}

export function mergeBusinessListings(previous: BusinessListing, next: BusinessListing): BusinessListing {
  return {
    ...previous,
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== null && value !== undefined)),
    category: previous.category ?? next.category,
    category_ids: [...new Set([...(previous.category_ids ?? []), ...(next.category_ids ?? [])])],
    additional_categories: [...new Set([...(previous.additional_categories ?? []), ...(next.additional_categories ?? [])])],
  };
}

/** Fetches all food-category results in a 15 km circle, following every page and deduplicating place IDs. */
export async function searchLisbonBusinessListings(
  onCost?: VendorCostCallback,
  reserveCost?: VendorCostReservation,
): Promise<{ items: BusinessListing[]; costUsd: number }> {
  const categories = await foodCategories();
  const byPlaceId = new Map<string, BusinessListing>();
  let costUsd = 0;

  for (let start = 0; start < categories.length; start += CATEGORIES_PER_REQUEST) {
    const batch = categories.slice(start, start + CATEGORIES_PER_REQUEST);
    let offsetToken: string | undefined;
    const seenTokens = new Set<string>();
    do {
      const page = await searchPage(batch, offsetToken, onCost, reserveCost);
      costUsd += page.costUsd;
      for (const item of page.items) {
        if (!item.place_id) continue;
        const previous = byPlaceId.get(item.place_id);
        byPlaceId.set(item.place_id, previous ? mergeBusinessListings(previous, item) : item);
      }
      offsetToken = page.offsetToken ?? undefined;
      if (offsetToken && seenTokens.has(offsetToken)) throw new Error("DataForSEO Business Listings repeated a pagination token");
      if (offsetToken) seenTokens.add(offsetToken);
    } while (offsetToken);
  }

  return { items: [...byPlaceId.values()], costUsd };
}
