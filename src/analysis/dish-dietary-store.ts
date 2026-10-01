import { db } from "@/lib/db";
import { EXTRACTOR_VERSION } from "./extract";
import { DISH_DIETARY_VERSION, type DishDietaryInput, type DishDietaryResult } from "./dish-dietary";

/** Newly queued, text-bearing Reviews with current frozen-extractor output and no current dish pass. */
export async function pendingDishDietary(
  restaurantId: number,
  window?: { since: Date; maxPerSource: number },
): Promise<DishDietaryInput[]> {
  const rows = await db()`
    with windowed as (
      select r.id, r.text, r.published_at,
        row_number() over (partition by l.source_code order by r.published_at desc, r.id desc) as source_rank
      from review r
      join listing l on l.id = r.listing_id
      join source s on s.code = l.source_code and s.kind = 'crowd'
      join review_analysis a on a.review_id = r.id and a.extractor_version = ${EXTRACTOR_VERSION}
      where l.restaurant_id = ${restaurantId} and r.text is not null
        and (${window?.since ?? null}::timestamptz is null or r.published_at >= ${window?.since ?? null})
    )
    select w.id, w.text from windowed w
    join review_dish_dietary facts on facts.review_id = w.id
    where facts.pass_version is distinct from ${DISH_DIETARY_VERSION}
      and (${window?.maxPerSource ?? null}::int is null or w.source_rank <= ${window?.maxPerSource ?? null})
    order by w.published_at desc, w.id desc`;
  return rows.map((row) => ({ id: Number(row.id), text: row.text as string }));
}

/** Stores the second-pass output separately; no frozen-extractor columns are read or changed here. */
export async function saveDishDietary(results: Map<number, DishDietaryResult>): Promise<void> {
  const sql = db();
  const all = [...results.values()];
  for (let offset = 0; offset < all.length; offset += 200) {
    const batch = all.slice(offset, offset + 200);
    await sql.begin(async (tx) => {
      for (const result of batch) {
        await tx`
          update review_dish_dietary set
            pass_version = ${DISH_DIETARY_VERSION},
            standout_dishes = ${tx.json(result.standoutDishes as never)},
            dietary_praise = ${tx.array(result.dietaryPraise)},
            dietary_complaints = ${tx.array(result.dietaryComplaints)},
            analysed_at = now()
          where review_id = ${result.reviewId}`;
      }
    });
  }
}
