import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_PAGE } from '@/common/dto/pagination.dto';
import { DrillFilterDto } from './dashboard.dto';

/**
 * `page` đi qua DTO chứ không qua `clamp`, nên phải tự chặn trần bằng
 * validator — thiếu nó thì `?page=9007199254740991` là số nguyên an toàn hợp
 * lệ, lọt qua validation, khiến `skip = (page - 1) * limit` vượt kiểu Int của
 * Prisma và bật 500 (đúng lỗi mà MAX_PAGE sinh ra để dập).
 */
describe('DrillFilterDto.page — có trần', () => {
  it('vượt MAX_PAGE thì bị validation từ chối', () => {
    const dto = plainToInstance(DrillFilterDto, { page: String(Number.MAX_SAFE_INTEGER) });
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('đúng bằng MAX_PAGE thì được chấp nhận', () => {
    const dto = plainToInstance(DrillFilterDto, { page: String(MAX_PAGE) });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('không truyền thì mặc định 1, hợp lệ', () => {
    const dto = plainToInstance(DrillFilterDto, {});
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
  });
});
