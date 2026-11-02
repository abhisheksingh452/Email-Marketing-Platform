import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsUUID()
  cursor?: string;
}

/** Controllers return this; the interceptor emits { data: items, meta: { nextCursor } }. */
export class PageResult<T> {
  constructor(
    public readonly items: T[],
    public readonly nextCursor: string | null,
  ) {}
}

/**
 * Cursor pagination on top of Prisma. The query MUST have a deterministic orderBy
 * ending in a unique column, e.g. [{ createdAt: 'desc' }, { id: 'desc' }].
 */
export async function paginate<T extends { id: string }>(
  page: PageQueryDto,
  run: (args: { take: number; cursor?: { id: string } }) => Promise<T[]>,
): Promise<PageResult<T>> {
  const limit = Math.min(page.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const rows = await run({
    take: limit + 1, // the extra row tells us whether another page exists
    ...(page.cursor ? { cursor: { id: page.cursor } } : {}),
  });
  const hasMore = rows.length > limit;
  return new PageResult(hasMore ? rows.slice(0, limit) : rows, hasMore ? rows[limit].id : null);
}
