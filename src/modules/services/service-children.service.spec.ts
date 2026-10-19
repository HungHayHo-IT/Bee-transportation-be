import { ConflictException, NotFoundException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ServiceChildrenService } from './service-children.service';

const NGUOI = { id: 7 } as AuthenticatedUser;

interface Con {
  id: number;
  serviceId: number;
  name: string;
  tmsMode: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Prisma giả tối thiểu — chỉ bốn lời gọi mà service này dùng. Dựng bằng tay
 * thay vì mock cả client: cái cần kiểm là LUẬT (trùng mã, sai cha, còn đơn thì
 * không xoá), không phải Prisma có chạy không.
 */
function dungPrisma(cons: Con[], soDonTheoCon: Record<number, number> = {}) {
  return {
    service: {
      findUnique: ({ where }: { where: { id: number } }) =>
        Promise.resolve(where.id === 1 ? { id: 1 } : null),
    },
    serviceChild: {
      findUnique: ({ where }: { where: { id: number } }) =>
        Promise.resolve(cons.find((c) => c.id === where.id) ?? null),
      findFirst: ({ where }: { where: Record<string, unknown> }) => {
        const boQua = (where.id as { not: number } | undefined)?.not;
        return Promise.resolve(
          cons.find((c) => c.serviceId === where.serviceId
            && c.tmsMode === where.tmsMode
            && c.id !== boQua) ?? null,
        );
      },
      findMany: ({ where }: { where: { serviceId: number; isActive?: boolean } }) =>
        Promise.resolve(
          cons
            .filter((c) => c.serviceId === where.serviceId
              && (where.isActive === undefined || c.isActive === where.isActive))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
            .map((c) => ({ ...c, _count: { orders: soDonTheoCon[c.id] ?? 0 } })),
        ),
      create: ({ data }: { data: Omit<Con, 'id' | 'isActive'> }) =>
        Promise.resolve({ ...data, id: 99, isActive: true } as Con),
      update: ({ where, data }: { where: { id: number }; data: Partial<Con> }) => {
        const cu = cons.find((c) => c.id === where.id)!;
        const moi = { ...cu, ...data };
        return Promise.resolve({ ...moi, _count: { orders: soDonTheoCon[where.id] ?? 0 } });
      },
      delete: jest.fn(() => Promise.resolve({})),
    },
    order: {
      count: ({ where }: { where: { serviceChildId: number } }) =>
        Promise.resolve(soDonTheoCon[where.serviceChildId] ?? 0),
    },
  } as unknown as PrismaService;
}

const activityGia = { log: jest.fn(() => Promise.resolve()) } as unknown as ActivityService;

const MOT: Con = { id: 10, serviceId: 1, name: 'Nội địa', tmsMode: 'DOMESTIC', sortOrder: 1, isActive: true };
const HAI: Con = { id: 11, serviceId: 1, name: 'Hàng lẻ', tmsMode: null, sortOrder: 2, isActive: false };
const CUA_CHA_KHAC: Con = { id: 12, serviceId: 2, name: 'Khác', tmsMode: 'CBT', sortOrder: 1, isActive: true };

describe('ServiceChildrenService', () => {
  it('không cho hai dịch vụ con trong cùng một cha mang cùng một mã TMS', async () => {
    const s = new ServiceChildrenService(dungPrisma([MOT]), activityGia);
    await expect(
      s.create(1, { name: 'Nội địa lần hai', tmsMode: 'DOMESTIC' }, NGUOI),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cho nhiều dịch vụ con cùng để trống mã — "chưa có mã" không phải một mã', async () => {
    const s = new ServiceChildrenService(dungPrisma([HAI]), activityGia);
    const tao = await s.create(1, { name: 'Chưa gắn mã', tmsMode: null }, NGUOI);
    expect(tao.tmsMode).toBeNull();
  });

  it('sửa chính nó mà giữ nguyên mã thì không bị coi là trùng', async () => {
    const s = new ServiceChildrenService(dungPrisma([MOT]), activityGia);
    const moi = await s.update(1, 10, { name: 'Nội địa (đổi tên)', tmsMode: 'DOMESTIC' }, NGUOI);
    expect(moi.name).toBe('Nội địa (đổi tên)');
  });

  it('không sửa được dịch vụ con của dịch vụ cha khác qua URL của cha này', async () => {
    const s = new ServiceChildrenService(dungPrisma([MOT, CUA_CHA_KHAC]), activityGia);
    await expect(s.update(1, 12, { name: 'Cướp' }, NGUOI))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('còn đơn đang dùng thì KHÔNG xoá, và câu lỗi nói rõ số đơn', async () => {
    const prisma = dungPrisma([MOT], { 10: 3 });
    const s = new ServiceChildrenService(prisma, activityGia);
    await expect(s.remove(1, 10, NGUOI)).rejects.toThrow(/3 đơn/);
    expect((prisma as unknown as { serviceChild: { delete: jest.Mock } }).serviceChild.delete)
      .not.toHaveBeenCalled();
  });

  it('chưa đơn nào dùng thì xoá được', async () => {
    const prisma = dungPrisma([MOT]);
    const s = new ServiceChildrenService(prisma, activityGia);
    await s.remove(1, 10, NGUOI);
    expect((prisma as unknown as { serviceChild: { delete: jest.Mock } }).serviceChild.delete)
      .toHaveBeenCalled();
  });

  it('activeOnly=true bỏ qua dòng đã tắt, mặc định thì giữ lại', async () => {
    const s = new ServiceChildrenService(dungPrisma([MOT, HAI]), activityGia);
    expect((await s.list(1)).map((c) => c.id)).toEqual([10, 11]);
    expect((await s.list(1, true)).map((c) => c.id)).toEqual([10]);
  });

  it('dịch vụ cha không tồn tại thì 404 chứ không trả danh sách rỗng', async () => {
    const s = new ServiceChildrenService(dungPrisma([]), activityGia);
    await expect(s.list(404)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('trả kèm số đơn đang dùng để màn quản trị biết dòng nào xoá được', async () => {
    const s = new ServiceChildrenService(dungPrisma([MOT, HAI], { 10: 5 }), activityGia);
    const ds = await s.list(1);
    expect(ds.find((c) => c.id === 10)?.orderCount).toBe(5);
    expect(ds.find((c) => c.id === 11)?.orderCount).toBe(0);
  });
});
