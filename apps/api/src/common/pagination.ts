import type { Paginated, PaginationQuery } from '@bachmai/shared';

export function toSkipTake(q: Pick<PaginationQuery, 'page' | 'pageSize'>) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function paginated<T>(items: T[], total: number, q: Pick<PaginationQuery, 'page' | 'pageSize'>): Paginated<T> {
  return { items, total, page: q.page, pageSize: q.pageSize };
}
