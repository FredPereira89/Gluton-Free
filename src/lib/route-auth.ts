// Which auth level a request needs, read from the route registry. Anything the registry does not
// declare is owner-only, except the read-only pages an Invitee may open.
import { routes, type AuthLevel } from "./api-contract";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compiled = Object.values(routes).map((route) => ({
  method: route.method as string,
  auth: route.auth as AuthLevel,
  pattern: new RegExp(`^${route.path.split(/\{[^}]+\}/).map(escape).join("[^/]+")}/?$`),
}));

// Pages are not in the registry. These are the pages an Invitee may open (ADR 0008); each page
// hides the Owner's tools from them.
const inviteePages = [/^\/restaurants\/?$/, /^\/r\/[^/]+\/?$/, /^\/r\/[^/]+\/history\/?$/, /^\/account\/?$/];

export function requiredAuthLevel(method: string, pathname: string): AuthLevel {
  const match = compiled.find((route) => route.method === method.toUpperCase() && route.pattern.test(pathname));
  if (match) return match.auth;
  return method.toUpperCase() === "GET" && inviteePages.some((page) => page.test(pathname)) ? "invitee" : "owner";
}
