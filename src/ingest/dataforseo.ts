// DataForSEO Business Data API: Google and Tripadvisor Reviews (high-priority queue).
// Responses carry reviewer identity; callers must map them through the whitelist in
// normalise.ts in memory and never log or persist them.
import { PipelineError } from "@/lib/pipeline-error";

const BASE = "https://api.dataforseo.com/v3/business_data";

/** Classifies a raw DataForSEO status message into a `code` + `detail` pair, never leaking the vendor payload. */
function vendorFailure(rawMessage: string): PipelineError {
  if (/fund|balance/i.test(rawMessage)) {
    const amounts = rawMessage.match(/([\d.]+)\s*USD[^0-9]+?([\d.]+)\s*USD/i);
    if (amounts) {
      const [, balance, needed] = amounts;
      return new PipelineError(
        "vendor_balance_low",
        `DataForSEO balance $${balance}, this lookup needs about $${needed}. Top up then retry.`,
      );
    }
    return new PipelineError("vendor_balance_low", "DataForSEO balance is too low for this lookup. Top up then retry.");
  }
  return new PipelineError("vendor_error", "The Reviews vendor could not complete this request. Retry in a few minutes.");
}

export type DfsSource = "google" | "tripadvisor";

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials are not set");
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

type DfsEnvelope = {
  status_code: number;
  status_message: string;
  cost: number;
  tasks: {
    id: string;
    status_code: number;
    status_message: string;
    cost: number;
    result: unknown[] | null;
  }[];
};

async function call(path: string, init?: { body?: unknown; base?: string }): Promise<DfsEnvelope> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${init?.base ?? BASE}${path}`, {
      method: init?.body ? "POST" : "GET",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const env = (await res.json().catch(() => null)) as DfsEnvelope | null;
    // Right after account verification some servers still answer 40104 for a while: retry a few times.
    if (res.status === 403 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 10_000));
      continue;
    }
    if (!res.ok || !env) throw vendorFailure(`DataForSEO ${path}: HTTP ${res.status}${env ? ` ${env.status_code} ${env.status_message}` : ""}`);
    if (env.status_code !== 20000) throw vendorFailure(`DataForSEO ${path}: ${env.status_code} ${env.status_message}`);
    return env;
  }
}

export type MapsSearchItem = {
  type?: string; place_id?: string | null; title?: string | null; address?: string | null;
  address_info?: { city?: string | null; district?: string | null } | null;
  latitude?: number | null; longitude?: number | null; category?: string | null;
  category_ids?: string[] | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
  price_level?: string | null;
  work_hours?: { current_status?: string | null } | null;
  work_time?: { work_hours?: { current_status?: string | null } | null } | null;
};

/** A live Google Maps result. Do not retain the vendor envelope or its extra fields. */
export async function searchGoogleMaps(keyword: string, near: { lat: number; lng: number }): Promise<{ items: MapsSearchItem[]; cost: number }> {
  const env = await call("/google/maps/live/advanced", {
    base: "https://api.dataforseo.com/v3/serp",
    body: [{ keyword, location_coordinate: `${near.lat},${near.lng},17z`, language_code: "pt", depth: 20 }],
  });
  const task = env.tasks?.[0];
  if (!task || task.status_code !== 20000) throw new Error(`DataForSEO Maps search: ${task?.status_code ?? "missing task"}`);
  const result = task.result?.[0] as { items?: MapsSearchItem[] } | undefined;
  return { items: result?.items ?? [], cost: task.cost ?? 0 };
}

export type GoogleBusinessReference = `place_id:${string}` | `cid:${string}`;

/** Resolve a Google place ID or CID to its current business facts. */
export async function googleBusinessByReference(reference: GoogleBusinessReference, near: { lat: number; lng: number }): Promise<{ item: MapsSearchItem | null; cost: number }> {
  const env = await call("/google/my_business_info/live", {
    body: [{ keyword: reference, location_coordinate: `${near.lat},${near.lng},200`, language_code: "pt" }],
  });
  const task = env.tasks?.[0];
  if (!task || task.status_code !== 20000) throw new Error(`DataForSEO business info: ${task?.status_code ?? "missing task"}`);
  const result = task.result?.[0] as { items?: MapsSearchItem[] } | undefined;
  return {
    item: result?.items?.find((item) => item.type === "google_business_info" && item.place_id
      && (reference.startsWith("cid:") || item.place_id === reference.slice("place_id:".length))) ?? null,
    cost: task.cost ?? 0,
  };
}

export type ReviewTaskParams =
  | { source: "google"; placeId: string; depth: number }
  | { source: "tripadvisor"; urlPath: string; depth: number };

/** Posts a Reviews task on the high-priority queue. Returns the task ID and what DataForSEO charged. */
export async function postReviewTask(p: ReviewTaskParams): Promise<{ taskId: string; cost: number }> {
  const body =
    p.source === "google"
      ? // A location is required even with place_id; 2620 is Portugal.
        { place_id: p.placeId, location_code: 2620, depth: p.depth, sort_by: "newest", language_code: "en", priority: 2 }
      : { url_path: p.urlPath, depth: p.depth, sort_by: "most_recent", translate_reviews: false, priority: 2 };
  const env = await call(`/${p.source}/reviews/task_post`, { body: [body] });
  const task = env.tasks[0];
  if (!task || task.status_code !== 20100) {
    throw new Error(`DataForSEO task_post: ${task?.status_code} ${task?.status_message}`);
  }
  return { taskId: task.id, cost: task.cost };
}

/**
 * Fetches a task's result. Returns null while it is still queued or running.
 * The returned value is the raw vendor result: whitelist it immediately.
 */
export async function getReviewTask(source: DfsSource, taskId: string): Promise<{ result: unknown; cost: number } | null> {
  const res = await fetch(`${BASE}/${source}/reviews/task_get/${taskId}`, {
    headers: { Authorization: authHeader() },
  });
  const env = (await res.json().catch(() => null)) as DfsEnvelope | null;
  // Right after account verification some servers still answer 40104 for a while: poll again.
  if (res.status === 403) return null;
  if (!res.ok || !env) throw new Error(`DataForSEO task_get: HTTP ${res.status}`);
  const task = env.tasks?.[0];
  if (!task) throw new Error(`DataForSEO task_get: no task in response (${env.status_code})`);
  // 40601 "Task Handed", 40602 "Task in Queue": not ready yet.
  if (task.status_code === 40601 || task.status_code === 40602) return null;
  if (task.status_code !== 20000) throw new Error(`DataForSEO task_get: ${task.status_code} ${task.status_message}`);
  return { result: task.result?.[0] ?? null, cost: task.cost };
}

/** Depth to request for a Listing: every Review, rounded up to DataForSEO's billing unit of 10. */
export function depthFor(reviewCount: number): number {
  return Math.min(4490, Math.max(10, Math.ceil((reviewCount + 20) / 10) * 10));
}

export type TripadvisorSearchItem = {
  type?: string; title?: string | null; url_path?: string | null; category?: string | null;
  reviews_count?: number | null;
  rating?: { value?: number | null; votes_count?: number | null } | null;
};

/** Posts a Tripadvisor Search task on the standard queue: this endpoint has no live/synchronous form. */
export async function postTripadvisorSearch(keyword: string): Promise<{ taskId: string; cost: number }> {
  // A location is required; 2620 is Portugal.
  const env = await call("/tripadvisor/search/task_post", { body: [{ keyword, location_code: 2620, language_code: "en" }] });
  const task = env.tasks[0];
  if (!task || task.status_code !== 20100) {
    throw new Error(`DataForSEO Tripadvisor search task_post: ${task?.status_code} ${task?.status_message}`);
  }
  return { taskId: task.id, cost: task.cost };
}

/** Fetches a Tripadvisor Search task's result. Returns null while it is still queued or running. */
export async function getTripadvisorSearch(taskId: string): Promise<{ items: TripadvisorSearchItem[]; cost: number } | null> {
  const res = await fetch(`${BASE}/tripadvisor/search/task_get/${taskId}`, {
    headers: { Authorization: authHeader() },
  });
  const env = (await res.json().catch(() => null)) as DfsEnvelope | null;
  // Right after account verification some servers still answer 40104 for a while: poll again.
  if (res.status === 403 && env?.status_code === 40104) return null;
  if (!res.ok || !env) throw new Error(`DataForSEO Tripadvisor search task_get: HTTP ${res.status}`);
  const task = env.tasks?.[0];
  if (!task) throw new Error(`DataForSEO Tripadvisor search task_get: no task in response (${env.status_code})`);
  // 40601 "Task Handed", 40602 "Task in Queue": not ready yet.
  if (task.status_code === 40601 || task.status_code === 40602) return null;
  if (task.status_code !== 20000) throw new Error(`DataForSEO Tripadvisor search task_get: ${task.status_code} ${task.status_message}`);
  const result = task.result?.[0] as { items?: TripadvisorSearchItem[] } | undefined;
  return { items: result?.items ?? [], cost: task.cost };
}
