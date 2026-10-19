import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { OrdersQueryService } from './orders-query.service';

const USER = { id: 1, roles: ['admin'], departmentId: null } as unknown as AuthenticatedUser;

function mk(total: number, rows: unknown[]) {
  const count = jest.fn().mockResolvedValue(total);
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    activityLog: { count, findMany },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  const svc = new OrdersQueryService(
    prisma,
    { orderWhere: () => ({}), orderReadWhere: () => ({}) } as never,
    { requiredFieldsOf: jest.fn().mockResolvedValue([]) } as never,
  );
  return { svc, count, findMany };
}

const ROW = { createdAt: new Date(), action: 'create', actor: { fullName: 'A' }, detail: null };

describe('OrdersQueryService.timeline — phân trang', () => {
  it('skip = (page - 1) * limit', async () => {
    const { svc, findMany } = mk(100, [ROW]);
    await svc.timeline(7, USER, 3, 20);
    expect(findMany.mock.calls[0][0].skip).toBe(40);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  /**
   * total PHẢI đến từ count(), không phải items.length. Lấy nhầm là FE tính ra
   * một trang duy nhất và nút "trang sau" biến mất — đúng cả lý do total tồn tại.
   */
  it('total lấy từ count, không phải số dòng của trang này', async () => {
    const { svc } = mk(234, [ROW]);
    const res = await svc.timeline(7, USER, 1, 20);
    expect(res.total).toBe(234);
    expect(res.items).toHaveLength(1);
  });

  it('giữ nguyên thứ tự thời gian tăng dần', async () => {
    const { svc, findMany } = mk(1, [ROW]);
    await svc.timeline(7, USER, 1, 20);
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });

  it('trang vượt quá dữ liệu trả items rỗng nhưng total vẫn thật', async () => {
    const { svc } = mk(5, []);
    const res = await svc.timeline(7, USER, 99, 20);
    expect(res.items).toEqual([]);
    expect(res.total).toBe(5);
  });
});
