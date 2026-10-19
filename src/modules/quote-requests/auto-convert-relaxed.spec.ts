import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { QuoteRequestService } from './quote-request.service';

/**
 * Chỉ nhánh auto-convert này được mở cửa nới, và nó phải mở bằng tham số nội bộ.
 * Nếu quên truyền, "Khai báo hải quan" và "Cho thuê thiết bị" lại rơi về im lặng
 * ở pending như trên production.
 */
function mk() {
  const create = jest.fn().mockResolvedValue({ id: 500 });
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue({ id: 5, isActive: true }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 1, email: 'sale@bee.vn', fullName: 'Sale', roles: ['sale'],
        departmentId: null, canViewCompanyReport: false, mustChangePassword: false,
        isActive: true,
      }),
    },
    quoteRequest: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 10, createdAt: new Date('2026-09-17T00:00:00Z') }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as unknown as PrismaService;

  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    { create } as unknown as OrdersService,
    { quoteRequestReceived: jest.fn().mockResolvedValue(undefined) } as unknown as CustomerNotifyService,
    {
      push: jest.fn().mockResolvedValue(undefined),
      admins: jest.fn().mockResolvedValue([1]),
      adminsAndSales: jest.fn().mockResolvedValue([1]),
    } as unknown as NotifyService,
  );
  return { svc, create };
}

describe('auto-convert — truyền cờ nội bộ cho OrdersService', () => {
  it('gọi orders.create với { fromPublicForm: true }', async () => {
    const { svc, create } = mk();
    await svc.create(
      { customerName: 'Nguyễn Linh', phone: '0977856665', serviceCode: 'RNT' },
      null, null,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][2]).toEqual({ fromPublicForm: true });
  });
});

/**
 * Đơn khách tự gửi KHÔNG đứng tên ai (13/10/2026). Trước đây nó đứng tên tài
 * khoản hệ thống public@bee.internal — tài khoản đó bị xoá là mọi yêu cầu từ
 * website ném lỗi và kẹt ở pending.
 */
describe('auto-convert — đơn của khách không cần tài khoản hệ thống', () => {
  it('khách vãng lai: tạo đơn với người đứng tên null, không tra tài khoản nào', async () => {
    const { svc, create } = mk();
    await svc.create({ customerName: 'Hương', phone: '0631116666', serviceCode: 'RNT' }, null, null);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toBeNull();
  });
});
