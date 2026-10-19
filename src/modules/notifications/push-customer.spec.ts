import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEvents } from './notification-events.service';
import { NotifyService } from './notify.service';

const mk = (createMany: jest.Mock) => {
  const events = new NotificationEvents();
  const prisma = { notification: { createMany } } as unknown as PrismaService;
  return { service: new NotifyService(prisma, events), events };
};

const CUSTOMER_ROW = {
  customerId: 7,
  quoteRequestId: 12,
  orderId: 3,
  type: CustomerNotifType.QUOTE_READY,
  title: 'Báo giá đơn BOP-001 đã có',
  body: '12.500.000đ',
};

const GUEST_ROW = {
  customerId: null,
  quoteRequestId: 12,
  type: CustomerNotifType.QUOTE_READY,
  title: 'Báo giá đã có',
};

describe('NotifyService.pushCustomer', () => {
  it('ghi dòng với customerId, KHÔNG đặt userId', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await mk(createMany).service.pushCustomer([CUSTOMER_ROW]);
    const written = createMany.mock.calls[0][0].data[0];
    expect(written.customerId).toBe(7);
    expect(written.userId).toBeNull();
    expect(written.quoteRequestId).toBe(12);
  });

  /** Khách vãng lai: cả userId lẫn customerId đều null, neo bằng quoteRequestId. */
  it('khách vãng lai ghi được với customerId null', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await mk(createMany).service.pushCustomer([GUEST_ROW]);
    const written = createMany.mock.calls[0][0].data[0];
    expect(written.customerId).toBeNull();
    expect(written.userId).toBeNull();
    expect(written.quoteRequestId).toBe(12);
  });

  /**
   * SSE là kênh của nhân viên. Bắn sự kiện cho khách vào bus staff thì
   * streamFor(userId) sẽ so customerId với userId — lẫn hai loại người dùng.
   */
  it('KHÔNG đẩy SSE — khách dùng push, không dùng SSE', async () => {
    const { service, events } = mk(jest.fn().mockResolvedValue({ count: 1 }));
    const spy = jest.spyOn(events, 'emit');
    await service.pushCustomer([CUSTOMER_ROW]);
    expect(spy).not.toHaveBeenCalled();
  });

  /** Ghi thông báo là việc PHỤ — không bao giờ được làm hỏng việc chính. */
  it('DB lỗi thì nuốt, không ném ra ngoài', async () => {
    const { service } = mk(jest.fn().mockRejectedValue(new Error('db down')));
    await expect(service.pushCustomer([CUSTOMER_ROW])).resolves.toBeUndefined();
  });

  it('mảng rỗng thì không chạm tới DB', async () => {
    const createMany = jest.fn();
    await mk(createMany).service.pushCustomer([]);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('pushed_at để trống — cron là bên đặt giá trị đó', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    await mk(createMany).service.pushCustomer([CUSTOMER_ROW]);
    expect(createMany.mock.calls[0][0].data[0].pushedAt).toBeUndefined();
  });
});
