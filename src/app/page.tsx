import { headers } from "next/headers";
import { AuthError, requireOwner } from "@/lib/auth";
import SearchHome from "./search-home";

export default async function HomePage() {
  const requestHeaders = new Headers(await headers());
  let canAddRestaurant = false;
  try {
    await requireOwner(new Request("https://app.local/", { headers: requestHeaders }));
    canAddRestaurant = true;
  } catch (error) {
    if (!(error instanceof AuthError) || error.status !== 403) throw error;
  }
  return <SearchHome canAddRestaurant={canAddRestaurant} />;
}
