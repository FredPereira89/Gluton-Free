import { getReviewTask, getTripadvisorSearch, postReviewTask, postTripadvisorSearch } from "@/ingest/dataforseo";
import { normaliseTripadvisor } from "@/ingest/normalise";
import type { BaselineTripadvisorProviders } from "./baseline-tripadvisor";

const POLL_SECONDS = 30;
const MAX_POLLS = 360;

async function poll<T>(get: () => Promise<T | null>, sleep: (seconds: number) => Promise<void>): Promise<T> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(POLL_SECONDS);
    const value = await get();
    if (value !== null) return value;
  }
  throw new Error("Tripadvisor standard queue exceeded three hours");
}

/** Standard-queue adapter. Reviews POSTs are spaced to stay below DataForSEO's 110/minute limit. */
export function baselineTripadvisorVendor(sleep: (seconds: number) => Promise<void>): BaselineTripadvisorProviders {
  let posting: Promise<void> = Promise.resolve();
  async function postReview(path: string, depth: number) {
    const previous = posting;
    let release!: () => void;
    posting = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await postReviewTask({ source: "tripadvisor", urlPath: path, depth, priority: 1 });
    } finally {
      try { await sleep(1); } finally { release(); }
    }
  }
  return {
    search: async (name) => {
      const posted = await postTripadvisorSearch(name);
      const result = await poll(() => getTripadvisorSearch(posted.taskId), sleep);
      return { items: result.items, costUsd: posted.cost + result.cost };
    },
    fetch: async (path, depth) => {
      const posted = await postReview(path, depth);
      const result = await poll(() => getReviewTask("tripadvisor", posted.taskId), sleep);
      const raw = result.result && typeof result.result === "object"
        ? (result.result as { items?: unknown }).items : null;
      return { normalised: normaliseTripadvisor(result.result), returnedCount: Array.isArray(raw) ? raw.length : 0,
        costUsd: posted.cost + result.cost };
    },
  };
}
