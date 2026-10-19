import { Prisma } from '@prisma/client';
import { CustomerNotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from './customer-notify.service';
import { NotifyService } from './notify.service';

interface Fixture {
  quoteRequest?: { id: number; customerId: number | null } | null;
  order?: { code: string } | null;
  dept?: { amount: unknown } | null;
  /** Phòng mà `dept` thuộc về — mặc định 5, khớp departmentId dùng trong test. */
  deptId?: number;
}

function mk(f: Fixture) {
  const pushCustomer = jest.fn().mockResolvedValue(undefined);
  const expectedDeptId = f.deptId ?? 5;
  const prisma = {
    quoteRequest: {
      findFirst: jest.fn().mockResolvedValue(f.quoteRequest ?? null),
      findUnique: jest.fn().mockResolvedValue(f.quoteRequest ?? null),
    },
    order: { findUnique: jest.fn().mockResolvedValue(f.order ?? null) },
    orderDepartment: {
      // Bắt buộc phải đọc ĐÚNG phòng được truyền vào: nếu quoteReady lỡ đọc
      // department khác (vd order.departmentId cũ), fake này trả null và test
      // sẽ lộ ngay — khác với fake trả `f.dept` vô điều kiện trước đây.
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          where.orderId_departmentId.departmentId === expectedDeptId ? (f.dept ?? null) : null,
        ),
      ),
    },
  } as unknown as PrismaService;
  const notify = { pushCustomer } as unknown as NotifyService;
  return { svc: new CustomerNotifyService(prisma, notify), pushCustomer };
}

describe('CustomerNotifyService.quoteReady', () => {
  const BASE = {
    quoteRequest: { id: 12, customerId: 7 },
    order: { code: 'BOP-250914-01' },
    dept: { amount: 12_500_000 },
  };

  it('bắn cho khách đã gửi yêu cầu, kèm mã đơn và số tiền', async () => {
    const { svc, pushCustomer } = mk(BASE);
    await svc.quoteReady(3, 5);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.customerId).toBe(7);
    expect(row.quoteRequestId).toBe(12);
    expect(row.orderId).toBe(3);
    expect(row.type).toBe(CustomerNotifType.QUOTE_READY);
    expect(row.title).toContain('BOP-250914-01');
    expect(row.body).toContain('12.500.000');
  });

  /**
   * Production truyền `OrderDepartment.amount` là Prisma.Decimal, không phải
   * number. money() gọi Number(v), tức dựa vào valueOf() của Decimal — fixture
   * bằng số trần không hề chạm vào đường đó, mà chuỗi tiền lại là TOÀN BỘ nội
   * dung của thông báo quan trọng nhất trong cả tính năng.
   */
  it('amount là Prisma.Decimal (như production) vẫn ra đúng chuỗi tiền', async () => {
    const { svc, pushCustomer } = mk({
      ...BASE,
      dept: { amount: new Prisma.Decimal(12_500_000) },
    });
    await svc.quoteReady(3, 5);
    expect(pushCustomer.mock.calls[0][0][0].body).toContain('12.500.000');
  });

  /** Đơn do Sale tự tạo, không từ khách nào. Ca bình thường, không phải lỗi. */
  it('đơn không sinh từ yêu cầu báo giá thì không bắn gì', async () => {
    const { svc, pushCustomer } = mk({ ...BASE, quoteRequest: null });
    await svc.quoteReady(3, 5);
    expect(pushCustomer).not.toHaveBeenCalled();
  });

  it('khách vãng lai (customerId null) vẫn bắn, neo bằng quoteRequestId', async () => {
    const { svc, pushCustomer } = mk({ ...BASE, quoteRequest: { id: 12, customerId: null } });
    await svc.quoteReady(3, 5);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.customerId).toBeNull();
    expect(row.quoteRequestId).toBe(12);
  });

  /** Chốt giá mà phòng thắng chưa điền amount: vẫn phải báo, chỉ là không có số. */
  it('chưa có amount thì vẫn bắn, body không kèm tiền', async () => {
    const { svc, pushCustomer } = mk({ ...BASE, dept: { amount: null } });
    await svc.quoteReady(3, 5);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.title).toContain('BOP-250914-01');
    expect(row.body).toBeUndefined();
  });

  /**
   * Pin chống hồi quy: đọc SAI phòng (không phải departmentId truyền vào) phải
   * không lấy được amount của phòng thắng — nếu quoteReady lỡ đọc nhầm phòng
   * khác (vd order.departmentId cũ) thì fake trả null và body mất tiền, khác
   * hẳn với case đúng phòng ở test đầu tiên.
   */
  it('gọi sai department id thì không lấy được amount của phòng thắng', async () => {
    const { svc, pushCustomer } = mk({ ...BASE, deptId: 5 });
    await svc.quoteReady(3, 999);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.body).toBeUndefined();
  });

  /**
   * Pin: đọc Prisma bên trong lỗi (vd DB hiccup) không được lọt ra ngoài —
   * quoteReady gọi SAU khi selectQuote đã commit, throw ra ngoài sẽ biến một
   * thao tác chọn giá đã thành công thành lỗi 500 phía Sale.
   */
  it('Prisma đọc lỗi thì quoteReady vẫn resolve, không throw', async () => {
    const { svc } = mk(BASE);
    (svc as unknown as { prisma: PrismaService }).prisma.order.findUnique = jest
      .fn()
      .mockRejectedValue(new Error('DB hiccup'));
    await expect(svc.quoteReady(3, 5)).resolves.toBeUndefined();
  });
});

describe('CustomerNotifyService.quoteRequestReceived', () => {
  it('bắn xác nhận đã nhận yêu cầu', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: { id: 12, customerId: 7 } });
    await svc.quoteRequestReceived(12);
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.type).toBe(CustomerNotifType.QUOTE_REQUEST_RECEIVED);
    expect(row.quoteRequestId).toBe(12);
    expect(row.customerId).toBe(7);
  });

  it('yêu cầu không tồn tại thì im lặng', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: null });
    await svc.quoteRequestReceived(99);
    expect(pushCustomer).not.toHaveBeenCalled();
  });
});

describe('CustomerNotifyService.quoteRequestRejected', () => {
  it('bắn kèm lý do từ chối', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: { id: 12, customerId: 7 } });
    await svc.quoteRequestRejected(12, 'Ngoài phạm vi phục vụ');
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.type).toBe(CustomerNotifType.QUOTE_REQUEST_REJECTED);
    expect(row.body).toContain('Ngoài phạm vi phục vụ');
  });
});

describe('CustomerNotifyService.orderEvent', () => {
  it('tra ngược khách từ orderId rồi bắn', async () => {
    const { svc, pushCustomer } = mk({
      quoteRequest: { id: 12, customerId: 7 },
      order: { code: 'BOP-250914-01' },
    });
    await svc.orderEvent(3, CustomerNotifType.ORDER_CLOSED, 'Đơn đã chốt', 'Cảm ơn bạn');
    const row = pushCustomer.mock.calls[0][0][0];
    expect(row.type).toBe(CustomerNotifType.ORDER_CLOSED);
    expect(row.orderId).toBe(3);
    expect(row.customerId).toBe(7);
  });

  it('đơn không từ khách nào thì không bắn', async () => {
    const { svc, pushCustomer } = mk({ quoteRequest: null, order: { code: 'BOP-1' } });
    await svc.orderEvent(3, CustomerNotifType.ORDER_CLOSED, 'Đơn đã chốt');
    expect(pushCustomer).not.toHaveBeenCalled();
  });
});
