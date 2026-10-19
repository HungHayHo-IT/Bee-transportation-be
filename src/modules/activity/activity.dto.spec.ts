import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ActivityController } from './activity.controller';
import { ACTIVITY_SORT_FIELDS, ActivityQueryDto } from './activity.dto';

const parse = (q: Record<string, unknown>): ActivityQueryDto =>
  plainToInstance(ActivityQueryDto, q);

/**
 * QA-30: PaginationDto khai sortBy/sortOrder cho mọi DTO kế thừa nó, nhưng
 * /activity cắm cứng orderBy nên hai tham số bị bỏ qua TRONG IM LẶNG — client tin
 * theo spec sẽ nhận thứ tự khác thứ tự mình xin mà không có lỗi nào báo.
 */
describe('ActivityQueryDto.sortBy (QA-30)', () => {
  it('nhận mọi cột trong danh sách trắng', () => {
    for (const f of ACTIVITY_SORT_FIELDS)
      expect(validateSync(parse({ sortBy: f }))).toHaveLength(0);
  });

  /** QA-29: tên cột tùy ý đi thẳng vào orderBy làm Prisma ném 500. */
  it('từ chối cột ngoài danh sách bằng 400, không phải 500', () => {
    const errors = validateSync(parse({ sortBy: 'nonsense' }));
    expect(errors).not.toHaveLength(0);
    expect(JSON.stringify(errors)).toContain('sortBy');
  });

  it('vắng sortBy vẫn hợp lệ', () => {
    expect(validateSync(parse({}))).toHaveLength(0);
  });

  it('giữ nguyên các bộ lọc của QA-27', () => {
    const dto = parse({ entity: 'orders', actorId: '6' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.actorId).toBe(6);
  });
});

describe('ActivityController áp dụng sortBy', () => {
  const mkController = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      activityLog: { count: jest.fn().mockResolvedValue(0), findMany },
    } as unknown as PrismaService;
    return { controller: new ActivityController(prisma), findMany };
  };

  it('mặc định vẫn là mới nhất trước', async () => {
    const { controller, findMany } = mkController();
    await controller.list(parse({}));
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  /** Vế thất bại của QA-30: trước đây câu này trả về desc dù client xin asc. */
  it('sortOrder=asc thật sự đảo thứ tự', async () => {
    const { controller, findMany } = mkController();
    await controller.list(parse({ sortOrder: 'asc' }));
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });

  it('sortBy chọn đúng cột được xin', async () => {
    const { controller, findMany } = mkController();
    await controller.list(parse({ sortBy: 'id', sortOrder: 'asc' }));
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ id: 'asc' });
  });
});
