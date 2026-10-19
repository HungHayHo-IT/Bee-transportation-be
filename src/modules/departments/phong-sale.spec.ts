import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { DepartmentsService } from './departments.service';

/**
 * Phòng Sale (076, 14/10/2026): không tham gia báo giá, nên không giữ dịch vụ
 * nào — mọi truy vấn phân đơn "phòng nào có dịch vụ X" tự bỏ qua nó.
 */
const admin = { id: 1, roles: ['admin'] } as unknown as AuthenticatedUser;

function dung(isSalesCu: boolean) {
  const row = {
    id: 14, name: 'Phòng Kinh Doanh', managerId: null, parentId: null,
    serviceIds: [1, 2, 3], isActive: true, isSales: isSalesCu,
    manager: null, _count: { members: 3 },
  };
  const update = jest.fn(({ data }) => Promise.resolve({ ...row, ...data }));
  const tx = {
    department: { update },
    order: { findMany: jest.fn().mockResolvedValue([]) },
    orderDepartment: { createMany: jest.fn() },
  };
  const prisma = {
    department: { findUnique: jest.fn().mockResolvedValue(row) },
    service: { count: jest.fn(({ where }) => Promise.resolve(where.id.in.length)) },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const svc = new DepartmentsService(prisma, { log: jest.fn() } as unknown as ActivityService);
  return { svc, update };
}

describe('Phòng Sale', () => {
  it('đánh dấu Sale thì phòng bỏ hết dịch vụ — không còn được phân đơn báo giá', async () => {
    const { svc, update } = dung(false);
    const kq = await svc.setServices(14, { serviceIds: [1, 2, 3], isSales: true }, admin);
    expect(update.mock.calls[0][0].data).toEqual({ serviceIds: [], isSales: true });
    expect(kq.isSales).toBe(true);
  });

  it('phòng đã là Sale, lưu lại không kèm cờ thì vẫn là Sale và vẫn không có dịch vụ', async () => {
    const { svc, update } = dung(true);
    await svc.setServices(14, { serviceIds: [1, 2] }, admin);
    expect(update.mock.calls[0][0].data).toEqual({ serviceIds: [], isSales: true });
  });

  it('bỏ cờ Sale thì phòng nhận lại dịch vụ được tick', async () => {
    const { svc, update } = dung(true);
    await svc.setServices(14, { serviceIds: [2], isSales: false }, admin);
    expect(update.mock.calls[0][0].data).toEqual({ serviceIds: [2], isSales: false });
  });
});
