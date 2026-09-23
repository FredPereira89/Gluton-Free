// DataForSEO Business Data API: Google and Tripadvisor Reviews (standard queue).
// Responses carry reviewer identity; callers must map them through the whitelist in
// normalise.ts in memory and never log or persist them.

const BASE = "https://api.dataforseo.com/v3/business_data";

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

async function call(path: string, init?: { body?: unknown }): Promise<DfsEnvelope> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.body ? "POST" : "GET",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`DataForSEO ${path}: HTTP ${res.status}`);
  const env = (await res.json()) as DfsEnvelope;
  if (env.status_code !== 20000) throw new Error(`DataForSEO ${path}: ${env.status_code} ${env.status_message}`);
  return env;
}

export type ReviewTaskParams =
  | { source: "google"; placeId: string; depth: number }
  | { source: "tripadvisor"; urlPath: string; depth: number };

/** Posts a Reviews task on the standard queue. Returns the task ID and what DataForSEO charged. */
export async function postReviewTask(p: ReviewTaskParams): Promise<{ taskId: string; cost: number }> {
  const body =
    p.source === "google"
      ? { place_id: p.placeId, depth: p.depth, sort_by: "newest", language_code: "en" }
      : { url_path: p.urlPath, depth: p.depth, sort_by: "most_recent", translate_reviews: false };
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
  if (!res.ok) throw new Error(`DataForSEO task_get: HTTP ${res.status}`);
  const env = (await res.json()) as DfsEnvelope;
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
