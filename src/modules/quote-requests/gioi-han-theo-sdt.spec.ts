import { HttpException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { OrdersService } from '../orders/orders.service';
import { GIOI_HAN_MOI_SO, QuoteRequestService } from './quote-request.service';

/** Chống dò giá: một số điện thoại gửi tối đa 3 yêu cầu trong 24 giờ. */
function mk(daGui: number) {
  const create = jest.fn().mockResolvedValue({ id: 1, createdAt: new Date() });
  const count = jest.fn().mockResolvedValue(daGui);
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue(null) },
    quoteRequest: { create, count, updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  } as unknown as PrismaService;
  const svc = new QuoteRequestService(
    prisma,
    { log: jest.fn() } as unknown as ActivityService,
    {} as OrdersService,
    { quoteRequestReceived: jest.fn() } as unknown as CustomerNotifyService,
    { push: jest.fn(), admins: jest.fn().mockResolvedValue([]), adminsAndSales: jest.fn().mockResolvedValue([]) } as unknown as NotifyService,
  );
  return { svc, create, count };
}

const DTO = { customerName: 'Nguyễn Linh', phone: '0977856665' };

describe('create — giới hạn theo số điện thoại', () => {
  it('còn lượt thì lưu, và đếm đúng số đó trong 24 giờ', async () => {
    const { svc, create, count } = mk(GIOI_HAN_MOI_SO - 1);
    await svc.create(DTO, null, null);
    expect(create).toHaveBeenCalled();
    const where = count.mock.calls[0][0].where;
    expect(where.phone).toBe('0977856665');
    expect(Date.now() - where.createdAt.gte.getTime()).toBeCloseTo(24 * 3600_000, -4);
  });

  it('hết lượt thì 429 và KHÔNG lưu', async () => {
    const { svc, create } = mk(GIOI_HAN_MOI_SO);
    const err = await svc.create(DTO, null, null).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });

  it('nhân viên nhập hộ không bị tính', async () => {
    const { svc, create, count } = mk(99);
    await svc.create(DTO, 5, null);
    expect(count).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
  });
});
