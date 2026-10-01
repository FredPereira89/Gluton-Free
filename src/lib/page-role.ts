// Which role is reading a page: the Owner or an Invitee. The proxy has already refused everyone
// else, but the role is re-read from the same session so a page never trusts a header (ADR 0008).
import { headers } from "next/headers";
import { requireCaller, type Caller } from "./auth";

export async function pageRole(): Promise<Caller["role"]> {
  const requestHeaders = new Headers(await headers());
  return (await requireCaller(new Request("https://app.local/", { headers: requestHeaders }), "invitee")).role;
}
