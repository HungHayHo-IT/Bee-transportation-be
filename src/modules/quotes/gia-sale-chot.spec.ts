import { BadRequestException, ConflictException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { OrderStatus, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { NotifyService } from '../notifications/notify.service';
import { SelectionService } from './selection.service';

/** Đơn landing: Sale nhập giá chốt riêng với khách, sau khi đã chọn phòng thắng. */
const SALE = { id: 7, roles: [Role.SALE] } as unknown as AuthenticatedUser;

function mk(over: Partial<{ source: string; status: string; departmentId: number | null }> = {}) {
  const order = {
    id: 1, code: 'DOM-1', createdBy: 7, source: 'website',
    status: OrderStatus.AWAITING_SELECTION, departmentId: 4,
    departments: [{ departmentId: 4, amount: 15_000_000, state: 'won' }],
    ...over,
  };
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue(order), update },
    orderSignature: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ order: { update } })),
  } as unknown as PrismaService;
  const quoteReady = jest.fn().mockResolvedValue(undefined);
  const svc = new SelectionService(
    prisma,
    { orderWhere: () => ({}) } as unknown as ScopeService,
    { log: jest.fn() } as unknown as ActivityService,
    {} as NotifyService,
    { quoteReady } as unknown as CustomerNotifyService,
  );
  return { svc, update, quoteReady };
}

describe('setSalePrice — giá Sale chốt với khách', () => {
  it('lưu giá, rồi mới báo khách', async () => {
    const { svc, update, quoteReady } = mk();
    await svc.setSalePrice(1, { salePrice: 18_000_000 }, SALE);
    expect(update.mock.calls[0][0].data.salePrice).toBe(18_000_000);
    expect(quoteReady).toHaveBeenCalledWith(1, 4);
  });

  it('bằng đúng giá phòng ban vẫn được', async () => {
    const { svc, update } = mk();
    await svc.setSalePrice(1, { salePrice: 15_000_000 }, SALE);
    expect(update).toHaveBeenCalled();
  });

  it('thấp hơn giá phòng ban thì chặn, không lưu, không báo khách', async () => {
    const { svc, update, quoteReady } = mk();
    await expect(svc.setSalePrice(1, { salePrice: 14_999_999 }, SALE)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
    expect(quoteReady).not.toHaveBeenCalled();
  });

  it('đơn Sale tự tạo cũng nhập được', async () => {
    const { svc, update } = mk({ source: 'hotline' });
    await svc.setSalePrice(1, { salePrice: 18_000_000 }, SALE);
    expect(update.mock.calls[0][0].data.salePrice).toBe(18_000_000);
  });

  it('chưa chọn phòng thắng thì không nhập được', async () => {
    const { svc } = mk({ departmentId: null, status: OrderStatus.QUOTING });
    await expect(svc.setSalePrice(1, { salePrice: 18_000_000 }, SALE)).rejects.toBeInstanceOf(ConflictException);
  });
});
