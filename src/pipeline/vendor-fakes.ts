import fixture from "./fixtures/lookup.json";

const usage = { input_tokens: 100, output_tokens: 40, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const sources = { google: fixture.googleReviews, tripadvisor: fixture.tripadvisorReviews };

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

export function fakeVendorFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  if (url.hostname === "api.apify.com" && url.pathname === "/v2/datasets/invented/items") {
    return Promise.resolve(response(fixture.apify.items));
  }
  const match = /^\/v3\/business_data\/(google|tripadvisor)\/reviews\/(task_post|task_get\/[^/]+)$/.exec(url.pathname);
  if (url.hostname !== "api.dataforseo.com" || !match) {
    return Promise.reject(new Error(`Unexpected external request in pipeline test: ${url.origin}${url.pathname}`));
  }
  const source = match[1] as keyof typeof sources;
  const operation = match[2]!;
  const depth = operation === "task_post" ? (JSON.parse(String(init?.body))[0].depth as number) : 0;
  const taskId = operation === "task_post" ? `${source}-${depth}` : operation.split("/")[1]!;
  const isPost = operation === "task_post";
  const texts = sources[source];
  const items = texts.map((reviewText, index) => ({
    review_id: `invented-${source}-${index + 1}`,
    review_text: reviewText,
    timestamp: new Date(Date.now() - index * 86400_000).toISOString(),
    rating: { value: 5 },
    language: "en",
    type: "google_reviews_search",
  }));
  const result = source === "google"
    ? { title: fixture.restaurant, place_id: "invented-google-place", reviews_count: texts.length, rating: { value: 5 }, items }
    : { title: fixture.restaurant, url_path: "invented-tripadvisor-path", reviews_count: texts.length, rating: { value: 5 }, items };
  return Promise.resolve(response({
    status_code: 20000,
    status_message: "Ok",
    cost: 0,
    tasks: [{
      id: taskId,
      status_code: isPost ? 20100 : 20000,
      status_message: "Ok",
      cost: isPost ? 0.01 : 0,
      result: isPost ? null : [result],
    }],
  }));
}

export const fakeAnthropic = {
  messages: {
    create: async (params: { messages: { content: string }[] }) => {
      const ids = [...params.messages[0]!.content.matchAll(/<review i="(\d+)"/g)].map((match) => Number(match[1]));
      return {
        usage,
        content: [{ type: "text", text: JSON.stringify({ reviews: ids.map((id) => ({
          i: id, ...fixture.anthropic.analysis,
        })) }) }],
      };
    },
    parse: async () => ({
      usage,
      parsed_output: { explanation: fixture.anthropic.explanation, quotes: [] },
      stop_reason: "end_turn",
    }),
    batches: {
      create: async () => { throw new Error("Unexpected Anthropic batch request"); },
      retrieve: async () => { throw new Error("Unexpected Anthropic batch poll"); },
      results: async () => { throw new Error("Unexpected Anthropic batch results request"); },
    },
  },
};
