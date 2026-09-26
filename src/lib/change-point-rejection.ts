import { apiJsonResponse, rejectChangePointResponseSchema } from "./api-contract";
import { db } from "./db";
import { ApiError } from "./problem";

export async function rejectChangePoint(id: number): Promise<Response> {
  await db().begin(async (tx) => {
    const [found] = await tx`select restaurant_id from owner_question where id = ${id} and kind = 'change_point'`;
    if (!found) throw new ApiError(404, "not_found", "Change point question not found");
    const restaurantId = Number(found.restaurant_id);
    await tx`select id from restaurant where id = ${restaurantId} for update`;
    const [question] = await tx`
      select status, payload from owner_question where id = ${id} and restaurant_id = ${restaurantId} for update`;
    if (question?.status !== "open") throw new ApiError(409, "already_settled", "This Owner question was already settled");
    const [count] = await tx`
      select count(*)::int as total from review_analysis a
      join review r on r.id = a.review_id join listing l on l.id = r.listing_id
      where l.restaurant_id = ${restaurantId} and a.change <> 'none'`;
    const payload = { ...(question.payload as object), mentionCount: Number(count!.total) };
    await tx`
      update owner_question set status = 'dismissed', settled_at = now(), payload = ${tx.json(payload as never)}
      where id = ${id}`;
  });
  return apiJsonResponse(rejectChangePointResponseSchema, 200, { settled: true });
}
