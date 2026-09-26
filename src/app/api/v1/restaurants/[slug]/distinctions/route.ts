import { apiJsonResponse, routes } from "@/lib/api-contract";
import { db } from "@/lib/db";
import { ApiError, parseApiRequest, requireOwnerApi, withApiErrors } from "@/lib/problem";

type Context = { params: Promise<{ slug: string }> };

async function bodyOf(request: Request): Promise<unknown> {
  return request.json().catch(() => { throw new ApiError(400, "invalid_request", "Invalid JSON body"); });
}

export const POST = withApiErrors(async (request: Request, { params }: Context) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.createDistinction.request.params, await params);
  const body = parseApiRequest(routes.createDistinction.request.body, await bodyOf(request));
  const [created] = await db()`
    insert into distinction (restaurant_id, guide, level, edition_year, url)
    select id, ${body.guide}, ${body.level}, ${body.editionYear}, ${body.url}
    from restaurant where slug = ${slug}
    returning id`;
  if (!created) throw new ApiError(404, "not_found", "Restaurant not found");
  return apiJsonResponse(routes.createDistinction.responses[201], 201, { id: Number(created.id) });
});

export const DELETE = withApiErrors(async (request: Request, { params }: Context) => {
  await requireOwnerApi(request);
  const { slug } = parseApiRequest(routes.deleteDistinction.request.params, await params);
  const { id } = parseApiRequest(routes.deleteDistinction.request.body, await bodyOf(request));
  const [deleted] = await db()`
    delete from distinction d using restaurant r
    where d.id = ${id} and d.restaurant_id = r.id and r.slug = ${slug}
    returning d.id`;
  if (!deleted) throw new ApiError(404, "not_found", "Distinction not found");
  return apiJsonResponse(routes.deleteDistinction.responses[200], 200, { deleted: true });
});
