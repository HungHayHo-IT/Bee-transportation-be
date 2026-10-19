import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';

const USER = { id: 5 } as AuthenticatedUser;

function mk() {
  const count = jest.fn().mockResolvedValue(0);
  const findMany = jest.fn().mockResolvedValue([]);
  const updateMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    notification: { count, findMany, updateMany },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  } as unknown as PrismaService;
  return { svc: new NotificationsService(prisma), count, findMany, updateMany };
}

/**
 * users.id và customer_accounts.id là hai sequence độc lập trùng nhau dày đặc.
 * Nếu có ngày ai đó gộp hai loại chủ sở hữu vào một cột thì đúng ba test này vỡ
 * trước khi dữ liệu của khách kịp lọt sang hộp thư nhân viên.
 */
describe('hộp thư nhân viên không chạm dữ liệu khách', () => {
  it('inbox lọc theo userId, không bao giờ theo customerId', async () => {
    const { svc, findMany } = mk();
    await svc.inbox(USER);
    const where = findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(5);
    expect(where).not.toHaveProperty('customerId');
  });

  it('unreadCount lọc theo userId', async () => {
    const { svc, count } = mk();
    await svc.unreadCount(USER);
    expect(count.mock.calls[0][0].where.userId).toBe(5);
  });

  it('markRead ràng userId nên không đụng dòng của khách', async () => {
    const { svc, updateMany } = mk();
    await svc.markRead(USER, undefined, true);
    expect(updateMany.mock.calls[0][0].where.userId).toBe(5);
  });
});
