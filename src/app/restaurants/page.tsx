import Link from "next/link";
import { connection } from "next/server";
import { TierBadge } from "@/web/atoms";
import { listRestaurants } from "@/web/data";
import { pageIdPagination, type PageSearchParams } from "@/web/pagination";

type Props = { searchParams: Promise<PageSearchParams> };

export default async function RestaurantListPage({ searchParams }: Props) {
  await connection();
  const pagination = pageIdPagination(await searchParams);
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
            <TierBadge tier={restaurant.tier} dashed={restaurant.provisional === true} />
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
