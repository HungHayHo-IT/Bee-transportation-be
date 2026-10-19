import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotificationsService } from './customer-notifications.service';

function mk(rows: unknown[] = [], total = 0) {
  const count = jest.fn().mockResolvedValue(total);
  const findMany = jest.fn().mockResolvedValue(rows);
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const update = jest.fn().mockResolvedValue({ pushOff: [CustomerNotifType.ORDER_MILESTONE] });
  const prisma = {
    notification: { count, findMany, updateMany },
    customerAccount: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ pushOff: [] }),
      update,
    },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  return { svc: new CustomerNotificationsService(prisma), count, findMany, updateMany, update };
}

describe('CustomerNotificationsService.inbox', () => {
  /** Lọc theo customerId, KHÔNG theo userId — đây là ranh giới giữa hai loại người dùng. */
  it('chỉ lấy thông báo của đúng khách đang hỏi', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(7);
    expect(findMany.mock.calls[0][0].where.customerId).toBe(7);
    expect(findMany.mock.calls[0][0].where.userId).toBeUndefined();
  });

  it('phân trang: page 2, limit 20 thì skip 20', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(7, undefined, 2, 20);
    expect(findMany.mock.calls[0][0].skip).toBe(20);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  it('lọc theo isRead khi có tham số', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(7, false);
    expect(findMany.mock.calls[0][0].where.isRead).toBe(false);
  });
});

describe('CustomerNotificationsService.markRead', () => {
  it('ràng customerId nên không đánh dấu được thông báo của người khác', async () => {
    const { svc, updateMany } = mk();
    await svc.markRead(7, [1, 2]);
    expect(updateMany.mock.calls[0][0].where.customerId).toBe(7);
    expect(updateMany.mock.calls[0][0].where.id).toEqual({ in: [1, 2] });
  });

  it('all = true thì bỏ điều kiện id', async () => {
    const { svc, updateMany } = mk();
    await svc.markRead(7, undefined, true);
    expect(updateMany.mock.calls[0][0].where.id).toBeUndefined();
  });
});

describe('CustomerNotificationsService.setPushOff', () => {
  it('ghi danh sách loại bị tắt', async () => {
    const { svc, update } = mk();
    const res = await svc.setPushOff(7, [CustomerNotifType.ORDER_MILESTONE]);
    expect(update.mock.calls[0][0].where).toEqual({ id: 7 });
    expect(res.pushOff).toEqual([CustomerNotifType.ORDER_MILESTONE]);
  });
});
