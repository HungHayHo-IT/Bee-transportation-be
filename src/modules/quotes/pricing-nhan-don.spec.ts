import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { DeptState, OrderStatus } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '../notifications/notify.service';
import { QuotesService } from './quotes.service';

/**
 * Luật nhận đơn / báo giá (chốt 12/10/2026):
 *   - chỉ Pricing (vai trò `staff`) nhận đơn — chặn ở @Roles của controller;
 *   - AI NHẬN (hoặc được trưởng phòng GIAO) thì người đó nhập báo giá;
 *   - trưởng phòng chỉ giao được cho Pricing.
 */
const pricing = (id: number): AuthenticatedUser => ({
  id, email: `p${id}@bee.vn`, fullName: `Pricing ${id}`, roles: ['staff'],
  departmentId: 3, canViewCompanyReport: false, mustChangePassword: false,
});
const truongPhong: AuthenticatedUser = { ...pricing(7), roles: ['manager'] };

function dung(dong: { state: DeptState; assigneeId: number | null }, nguoiDuocGiao?: { roles: string[] }) {
  const order = { id: 11, code: 'DOM-20261012-001', status: OrderStatus.DISTRIBUTED, createdBy: 99, departments: [] };
  const stub = {
    order: {
      findFirst: jest.fn().mockResolvedValue(order),
      findUniqueOrThrow: jest.fn().mockResolvedValue(order),
      findUnique: jest.fn().mockResolvedValue(order),
    },
    orderDepartment: {
      findUnique: jest.fn().mockResolvedValue({ orderId: 11, departmentId: 3, claimedAt: null, ...dong }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ scopeNote: null, leadTime: null, validUntil: null }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 30, isActive: true, departmentId: 3, roles: ['staff'], ...nguoiDuocGiao,
      }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = { ...stub, $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(stub)) } as unknown as PrismaService;
  const notify = {
    push: jest.fn().mockResolvedValue(undefined),
    deptRecipients: jest.fn().mockResolvedValue([]),
    admins: jest.fn().mockResolvedValue([]),
  } as unknown as NotifyService;
  const svc = new QuotesService(
    prisma,
    { orderWhere: () => ({}) } as unknown as ScopeService,
    { log: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
    notify,
    {} as never,
  );
  return { svc, stub };
}

const GIA = { amount: 5_000_000 };

describe('Pricing nhan don va bao gia', () => {
  it('Pricing nhan don thi thanh nguoi phu trach', async () => {
    const { svc, stub } = dung({ state: DeptState.PENDING, assigneeId: null });
    await svc.claim(11, 3, pricing(20));
    expect(stub.orderDepartment.update.mock.calls[0][0].data)
      .toMatchObject({ state: DeptState.CLAIMED, assigneeId: 20 });
  });

  it('nguoi da nhan thi nhap duoc bao gia', async () => {
    const { svc, stub } = dung({ state: DeptState.CLAIMED, assigneeId: 20 });
    await svc.quote(11, 3, GIA, pricing(20));
    expect(stub.$executeRaw).toHaveBeenCalledTimes(1);
  });

  /** Trước đây ai trong phòng cũng gửi được — hai người cùng nhập một đơn. */
  it('Pricing KHAC trong phong khong nhap duoc', async () => {
    const { svc, stub } = dung({ state: DeptState.CLAIMED, assigneeId: 20 });
    await expect(svc.quote(11, 3, GIA, pricing(23))).rejects.toBeInstanceOf(ForbiddenException);
    expect(stub.$executeRaw).not.toHaveBeenCalled();
  });

  it('chua ai nhan thi khong nhap duoc — phai nhan truoc', async () => {
    const { svc } = dung({ state: DeptState.PENDING, assigneeId: null });
    await expect(svc.quote(11, 3, GIA, pricing(20))).rejects.toThrow(/Nhận đơn/);
  });

  it('truong phong giao cho Pricing thi duoc', async () => {
    const { svc, stub } = dung({ state: DeptState.PENDING, assigneeId: null });
    await svc.assign(11, 3, { assigneeId: 30 }, truongPhong);
    expect(stub.orderDepartment.update.mock.calls[0][0].data).toMatchObject({ assigneeId: 30 });
  });

  /** Người được giao là người nhập báo giá — giao cho Sale là giao việc họ không làm được. */
  it('truong phong KHONG giao duoc cho nguoi khong phai Pricing', async () => {
    const { svc, stub } = dung({ state: DeptState.PENDING, assigneeId: null }, { roles: ['sale'] });
    await expect(svc.assign(11, 3, { assigneeId: 30 }, truongPhong)).rejects.toBeInstanceOf(BadRequestException);
    expect(stub.orderDepartment.update).not.toHaveBeenCalled();
  });
});
