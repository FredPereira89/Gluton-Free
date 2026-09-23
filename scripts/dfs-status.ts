// Prints whether the DataForSEO account can use the Business Data API, and its balance.
// Status codes only: no payload is printed.
const auth = "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");

async function check(path: string) {
  const res = await fetch(`https://api.dataforseo.com/v3${path}`, { headers: { Authorization: auth } });
  const body = (await res.json().catch(() => null)) as { status_code?: number; status_message?: string; tasks?: { result?: { money?: { balance?: number } }[] }[] } | null;
  return { http: res.status, code: body?.status_code, message: body?.status_message, body };
}

const user = await check("/appendix/user_data");
console.log("user_data:", user.http, user.code, "balance", user.body?.tasks?.[0]?.result?.[0]?.money?.balance);
const ready = await check("/business_data/google/reviews/tasks_ready");
console.log("business_data:", ready.http, ready.code, ready.message);

export {};
