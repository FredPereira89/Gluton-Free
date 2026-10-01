// Which auth level a request needs, read from the route registry. Anything the registry does not
// declare (every page, an unknown path or method) is owner-only.
import { routes, type AuthLevel } from "./api-contract";

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compiled = Object.values(routes).map((route) => ({
  method: route.method as string,
  auth: route.auth as AuthLevel,
  pattern: new RegExp(`^${route.path.split(/\{[^}]+\}/).map(escape).join("[^/]+")}/?$`),
}));

export function requiredAuthLevel(method: string, pathname: string): AuthLevel {
  const match = compiled.find((route) => route.method === method.toUpperCase() && route.pattern.test(pathname));
  return match?.auth ?? "owner";
}
