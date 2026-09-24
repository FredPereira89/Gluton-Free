// A screen's ?cursor&limit, validated like the API's; anything invalid is a 404.
import { notFound } from "next/navigation";
import { type IdPagination, parseIdPagination } from "@/lib/api-contract";
import { ApiError } from "@/lib/problem";

export type PageSearchParams = { cursor?: string | string[]; limit?: string | string[] };

export function pageIdPagination(search: PageSearchParams): IdPagination {
  if (Array.isArray(search.cursor) || Array.isArray(search.limit)) notFound();
  const query = new URLSearchParams();
  if (search.cursor !== undefined) query.set("cursor", search.cursor);
  if (search.limit !== undefined) query.set("limit", search.limit);
  try {
    return parseIdPagination(query);
  } catch (error) {
    if (error instanceof ApiError) notFound();
    throw error;
  }
}
