import { NotifType } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEvents } from './notification-events.service';
import { NotifyService } from './notify.service';

interface Person {
  id: number;
  isActive: boolean;
}

interface Fixture {
  manager: Person | null;
  assignee: Person | null;
  /** Biên chế phòng. Một số = nhân viên thường; `[id, ...vai]` để khai vai trò. */
  members: (number | [number, ...string[]])[];
}

/** Mặc định 'staff' — mọi ca cũ của bộ test này nói về nhân viên phòng. */
const bienChe = (m: number | [number, ...string[]]): { id: number; roles: string[] } =>
  (typeof m === 'number' ? { id: m, roles: ['staff'] } : { id: m[0], roles: m.slice(1) as string[] });

/**
 * Prisma giả tối thiểu: chỉ ba truy vấn deptRecipients dùng tới. Dựng module Nest
 * thật ở đây không thêm gì — hàm này là logic hợp tập hợp, không phải logic Nest.
 */
const mkPrisma = (f: Fixture): PrismaService =>
  ({
    department: {
      findUnique: jest.fn().mockResolvedValue({ manager: f.manager }),
    },
    orderDepartment: {
      findUnique: jest.fn().mockResolvedValue({ assignee: f.assignee }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue(f.members.map(bienChe)),
    },
  }) as unknown as PrismaService;

const ACTIVE = (id: number): Person => ({ id, isActive: true });
const LOCKED = (id: number): Person => ({ id, isActive: false });

const mkService = (f: Fixture): NotifyService =>
  new NotifyService(mkPrisma(f), new NotificationEvents());

const recipients = (f: Fixture): Promise<number[]> => mkService(f).deptRecipients(null, 100, 3);

describe('NotifyService.deptRecipients', () => {
  /**
   * Phải khớp ScopeService.orderWhere: người CHỈ là Sale không đọc được đơn của
   * phòng nữa, nên bắn thông báo phòng cho họ là mời bấm vào một đơn trả 404.
   */
  it('người CHỈ là Sale trong biên chế phòng KHÔNG nhận thông báo của phòng', async () => {
    const ids = await recipients({ manager: ACTIVE(1), assignee: null, members: [1, [7, 'sale'], 8] });
    expect(ids).not.toContain(7);
    expect(ids.sort()).toEqual([1, 8]);
  });

  it('trưởng phòng KIÊM sale vẫn nhận — không phải CHỈ là Sale', async () => {
    const ids = await recipients({
      manager: ACTIVE(9), assignee: null, members: [[9, 'manager', 'sale']],
    });
    expect(ids).toContain(9);
  });

  it('sale ĐƯỢC GÁN việc vẫn nhận, vì vào qua đường người được gán', async () => {
    const ids = await recipients({ manager: null, assignee: ACTIVE(7), members: [[7, 'sale']] });
    expect(ids).toContain(7);
  });
  it('trả về MỌI thành viên đang hoạt động của phòng, không chỉ trưởng phòng', async () => {
    const ids = await recipients({ manager: ACTIVE(1), assignee: ACTIVE(2), members: [1, 2, 3, 4] });
    expect(ids.sort()).toEqual([1, 2, 3, 4]);
  });

  it('nhân viên chưa được gán việc vẫn nhận thông báo của phòng', async () => {
    const ids = await recipients({ manager: ACTIVE(1), assignee: null, members: [1, 5] });
    expect(ids).toContain(5);
  });

  /**
   * departments.manager_id và users.department_id là HAI quan hệ tách rời: trưởng
   * phòng có thể không nằm trong biên chế phòng. Bỏ vế managerId là mất người này.
   */
  it('giữ trưởng phòng kể cả khi họ không thuộc biên chế phòng', async () => {
    const ids = await recipients({ manager: ACTIVE(9), assignee: null, members: [1, 2] });
    expect(ids).toContain(9);
  });

  /** Admin có quyền gán người ngoài phòng phụ trách đơn. */
  it('giữ người được gán kể cả khi họ ngoài phòng', async () => {
    const ids = await recipients({ manager: ACTIVE(1), assignee: ACTIVE(8), members: [1, 2] });
    expect(ids).toContain(8);
  });

  it('khử trùng lặp khi trưởng phòng cũng chính là người được gán', async () => {
    const ids = await recipients({ manager: ACTIVE(1), assignee: ACTIVE(1), members: [1, 2] });
    expect(ids.sort()).toEqual([1, 2]);
  });

  it('phòng chưa có trưởng phòng và chưa gán ai vẫn bắn cho nhân viên phòng', async () => {
    const ids = await recipients({ manager: null, assignee: null, members: [6, 7] });
    expect(ids.sort()).toEqual([6, 7]);
  });

  it('trưởng phòng đã bị khóa tài khoản thì không nhận nữa', async () => {
    const ids = await recipients({ manager: LOCKED(9), assignee: null, members: [1] });
    expect(ids).toEqual([1]);
  });

  it('người được gán đã bị khóa tài khoản thì không nhận nữa', async () => {
    const ids = await recipients({ manager: null, assignee: LOCKED(8), members: [1] });
    expect(ids).toEqual([1]);
  });

  it('phòng rỗng hoàn toàn -> mảng rỗng', async () => {
    expect(await recipients({ manager: null, assignee: null, members: [] })).toEqual([]);
  });

  it('chỉ lấy người đang hoạt động của ĐÚNG phòng được hỏi', async () => {
    const prisma = mkPrisma({ manager: null, assignee: null, members: [6] });
    await new NotifyService(prisma, new NotificationEvents()).deptRecipients(null, 100, 3);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { departmentId: 3, isActive: true },
      select: { id: true, roles: true },
    });
  });
});

describe('NotifyService.push', () => {
  const row = { userId: 4, orderId: 9, type: NotifType.NEW_ORDER, title: 'Đơn mới' };

  const mkPush = (createMany: jest.Mock) => {
    const events = new NotificationEvents();
    const prisma = { notification: { createMany } } as unknown as PrismaService;
    return { service: new NotifyService(prisma, events), events };
  };

  it('đẩy realtime sau khi ghi thành công', async () => {
    const { service, events } = mkPush(jest.fn().mockResolvedValue({ count: 1 }));
    const spy = jest.spyOn(events, 'emit');
    await service.push([row]);
    expect(spy).toHaveBeenCalledWith([row]);
  });

  /** Báo realtime cho một dòng chưa ghi được là đẩy client đi tìm thứ không có. */
  it('KHÔNG đẩy realtime khi ghi thất bại', async () => {
    const { service, events } = mkPush(jest.fn().mockRejectedValue(new Error('db down')));
    const spy = jest.spyOn(events, 'emit');
    await expect(service.push([row])).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  /** Bus hỏng không được làm hỏng việc chính; ghi đã xong rồi. */
  it('bus hỏng thì nuốt lỗi, không ném ra ngoài', async () => {
    const { service, events } = mkPush(jest.fn().mockResolvedValue({ count: 1 }));
    jest.spyOn(events, 'emit').mockImplementation(() => {
      throw new Error('bus down');
    });
    await expect(service.push([row])).resolves.toBeUndefined();
  });

  it('mảng rỗng thì không chạm tới DB', async () => {
    const createMany = jest.fn();
    const { service } = mkPush(createMany);
    await service.push([]);
    expect(createMany).not.toHaveBeenCalled();
  });
});
