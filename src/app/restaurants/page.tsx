import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { parsePagination, idCursorQuerySchema } from "@/lib/api-contract";
import { ApiError, parseApiRequest } from "@/lib/problem";
import { TierBadge } from "@/web/atoms";
import { listRestaurants } from "@/web/data";

type Props = { searchParams: Promise<{ cursor?: string | string[]; limit?: string | string[] }> };

export default async function RestaurantListPage({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  if (Array.isArray(params.cursor) || Array.isArray(params.limit)) notFound();
  const query = new URLSearchParams();
  if (params.cursor !== undefined) query.set("cursor", params.cursor);
  if (params.limit !== undefined) query.set("limit", params.limit);

  let pagination;
  try {
    pagination = parseApiRequest(idCursorQuerySchema, parsePagination(query));
  } catch (error) {
    if (error instanceof ApiError) notFound();
    throw error;
  }
  const page = await listRestaurants(pagination);
  const next = new URLSearchParams({ cursor: page.nextCursor ?? "", limit: String(pagination.limit) });

  return (
    <section className="index">
      <h1>Restaurants</h1>
      {page.items.map((restaurant) => (
        <Link className="row" href={`/r/${encodeURIComponent(restaurant.slug)}`} key={restaurant.slug}>
          <span>
            <b>{restaurant.name}</b>
            <span className="small muted"> · {restaurant.area ?? restaurant.city}</span>
          </span>
          {restaurant.state === "verdict" && restaurant.tier ? (
            <TierBadge tier={restaurant.tier} dashed />
          ) : restaurant.state === "not_enough_evidence" ? (
            <span className="nee">Not enough evidence</span>
          ) : (
            <span className="small muted">No Verdict yet</span>
          )}
        </Link>
      ))}
      {page.items.length === 0 && !pagination.cursor && <p className="muted">No Restaurants yet.</p>}
      {page.nextCursor && <Link className="next-page" href={`/restaurants?${next}`}>More Restaurants</Link>}
    </section>
  );
}
