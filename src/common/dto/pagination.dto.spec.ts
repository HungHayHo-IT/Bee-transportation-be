import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_PAGE, PaginationDto } from './pagination.dto';

/**
 * `page` không có trần thì `?page=9007199254740991` là số nguyên an toàn hợp
 * lệ, lọt qua validation, khiến `skip = (page - 1) * limit` vượt kiểu Int của
 * Prisma và bật 500 (đúng lỗi mà MAX_PAGE sinh ra để dập) — cùng lỗ hổng đã vá
 * cho DrillFilterDto.page ở fa7e993, nay vá cho PaginationDto.page.
 */
describe('PaginationDto.page — có trần', () => {
  it('vượt MAX_PAGE thì bị validation từ chối', () => {
    const dto = plainToInstance(PaginationDto, { page: String(Number.MAX_SAFE_INTEGER) });
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('đúng bằng MAX_PAGE thì được chấp nhận', () => {
    const dto = plainToInstance(PaginationDto, { page: String(MAX_PAGE) });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('không truyền thì mặc định 1, hợp lệ', () => {
    const dto = plainToInstance(PaginationDto, {});
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
  });
});
