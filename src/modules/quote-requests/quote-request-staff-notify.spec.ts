import { ActivityService } from '@/common/activity/activity.service';
import { NotifType, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { QuoteRequestService } from './quote-request.service';

function mk(
  opts: { serviceId?: number; convertThrows?: boolean; recipientLookupThrows?: boolean } = {},
) {
  const push = jest.fn().mockResolvedValue(undefined);
  const ordersCreate = opts.convertThrows
    ? jest.fn().mockRejectedValue(new Error('không định tuyến được'))
    : jest.fn().mockResolvedValue({ id: 55 });

  const prisma = {
    service: {
      findUnique: jest.fn().mockResolvedValue(
        opts.serviceId ? { id: opts.serviceId, isActive: true } : null,
      ),
    },
    quoteRequest: {
      count: jest.fn().mockResolvedValue(0),
      // createdAt bắt buộc: create() gọi row.createdAt.toISOString() vô điều kiện.
      create: jest.fn().mockResolvedValue({ id: 12, createdAt: new Date('2026-09-14T00:00:00Z') }),
      update: jest.fn().mockResolvedValue({ id: 12 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1, isActive: true, roles: [Role.SALE], email: 'a@b.c',
        fullName: 'Sale', departmentId: null, canViewCompanyReport: false,
        mustChangePassword: false,
      }),
      findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    },
  } as unknown as PrismaService;

  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    { create: ordersCreate } as unknown as OrdersService,
    {
      quoteRequestReceived: jest.fn().mockResolvedValue(undefined),
      quoteRequestRejected: jest.fn().mockResolvedValue(undefined),
    } as unknown as CustomerNotifyService,
    {
      push,
      admins: opts.recipientLookupThrows
        ? jest.fn().mockRejectedValue(new Error('DB chập chờn'))
        : jest.fn().mockResolvedValue([1, 2]),
      adminsAndSales: opts.recipientLookupThrows
        ? jest.fn().mockRejectedValue(new Error('DB chập chờn'))
        : jest.fn().mockResolvedValue([1, 2]),
    } as unknown as NotifyService,
  );
  return { svc, push };
}

const DTO = { customerName: 'Cty ABC', phone: '0900000000' };

/**
 * Yêu cầu không có serviceId thì KHÔNG auto-convert, nên không sinh Order, nên
 * NEW_ORDER (gắn vào Order) không bắn. Trước khi vá, ca này không báo cho ai và
 * bản ghi nằm im ở status='pending'.
 */
describe('yêu cầu báo giá không có dịch vụ', () => {
  it('bắn quote_request_new cho Admin và Sale', async () => {
    const { svc, push } = mk();
    await svc.create(DTO, null, null);
    const rows = push.mock.calls.flatMap((c) => c[0]);
    const news = rows.filter((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_NEW);
    expect(news.map((r: { userId: number }) => r.userId).sort()).toEqual([1, 2]);
    expect(news[0].quoteRequestId).toBe(12);
  });

  it('không gắn orderId — lúc bắn chưa có đơn nào', async () => {
    const { svc, push } = mk();
    await svc.create(DTO, null, null);
    const row = push.mock.calls.flatMap((c) => c[0])
      .find((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_NEW);
    expect(row.orderId).toBeUndefined();
  });

  /**
   * adminsAndSales() không tự bọc try/catch (khác push()). Nếu nó ném lỗi thì
   * bản ghi quote_request (đã lưu trước đó) vẫn phải sống sót — lỗi ở bước
   * "báo cho nhân viên" không được lan ra làm hỏng request của khách.
   */
  it('tra người nhận lỗi thì vẫn không ném ra ngoài — request đã lưu vẫn còn', async () => {
    const { svc } = mk({ recipientLookupThrows: true });
    await expect(svc.create(DTO, null, null)).resolves.toBeDefined();
  });
});

/** Có serviceId thì notifyNewOrder đã lo — không được bắn trùng thêm lần nữa. */
describe('yêu cầu báo giá CÓ dịch vụ và convert thành công', () => {
  it('KHÔNG bắn quote_request_new', async () => {
    const { svc, push } = mk({ serviceId: 4 });
    await svc.create({ ...DTO, serviceId: 4 }, null, null);
    const rows = push.mock.calls.flatMap((c) => c[0]);
    expect(rows.some((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_NEW)).toBe(false);
  });
});

/** Trước khi vá, lỗi này chỉ vào activity log và không ai biết có việc hỏng. */
describe('auto-convert ném lỗi', () => {
  it('bắn quote_request_failed cho Admin', async () => {
    const { svc, push } = mk({ serviceId: 4, convertThrows: true });
    await svc.create({ ...DTO, serviceId: 4 }, null, null);
    const rows = push.mock.calls.flatMap((c) => c[0]);
    const failed = rows.filter((r: { type: string }) => r.type === NotifType.QUOTE_REQUEST_FAILED);
    expect(failed).toHaveLength(2);
    expect(failed[0].quoteRequestId).toBe(12);
  });

  it('vẫn không ném lỗi ra ngoài — yêu cầu của khách đã được lưu', async () => {
    const { svc } = mk({ serviceId: 4, convertThrows: true });
    await expect(svc.create({ ...DTO, serviceId: 4 }, null, null)).resolves.toBeDefined();
  });

  /**
   * Trong catch, admins() cũng không tự bọc try/catch. Nếu NÓ ném lỗi ngay
   * sau khi convert đã lỗi, request vẫn phải sống sót — hai lỗi cộng dồn
   * không được biến thành một request mất luôn.
   */
  it('admins() cũng lỗi thì vẫn không ném ra ngoài — request đã lưu vẫn còn', async () => {
    const { svc } = mk({ serviceId: 4, convertThrows: true, recipientLookupThrows: true });
    await expect(svc.create({ ...DTO, serviceId: 4 }, null, null)).resolves.toBeDefined();
  });
});
