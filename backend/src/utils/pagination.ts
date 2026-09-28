import { z } from "zod";

export const MAX_PAGE_SIZE = 100;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const offsetOf = (p: Pagination) => (p.page - 1) * p.limit;

export function paginated<T>(data: T[], total: number, p: Pagination) {
  return { data, total, page: p.page, pageSize: p.limit, hasMore: p.page * p.limit < total };
}

/** Escapes LIKE wildcards so user search text is matched literally. */
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
