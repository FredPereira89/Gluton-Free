import { apiJsonResponse, routes } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

type Context = { params: Promise<{ slug: string }> };

async function bodyOf(request: Request): Promise<unknown> {
  return request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
}

export const POST = withApiErrors(async (request: Request, { params }: Context) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.createCriticPiece.request.params, await params);
  const body = parseApiRequest(routes.createCriticPiece.request.body, await bodyOf(request));
  const [created] = await db()`
    insert into critic_piece (restaurant_id, publication, title, url, published_on, language, printed_rating)
    select id, ${body.publication}, ${body.title}, ${body.url}, ${body.publishedOn}, ${body.language}, ${body.printedRating}
    from restaurant where slug = ${slug}
    returning id`;
  if (!created) throw new ApiError(404, "not_found", "Restaurant not found");
  return apiJsonResponse(routes.createCriticPiece.responses[201], 201, { id: Number(created.id) });
});

export const DELETE = withApiErrors(async (request: Request, { params }: Context) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.deleteCriticPiece.request.params, await params);
  const { id } = parseApiRequest(routes.deleteCriticPiece.request.body, await bodyOf(request));
  const [deleted] = await db()`
    delete from critic_piece c using restaurant r
    where c.id = ${id} and c.restaurant_id = r.id and r.slug = ${slug}
    returning c.id`;
  if (!deleted) throw new ApiError(404, "not_found", "Critic piece not found");
  return apiJsonResponse(routes.deleteCriticPiece.responses[200], 200, { deleted: true });
});
