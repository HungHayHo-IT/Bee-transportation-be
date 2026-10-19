import { DeptState, MilestoneStatus, OrderStatus, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';

/**
 * Đo trên dữ liệu thật 16-09: đơn vừa `close` là rơi khỏi mọi danh sách của
 * người phụ trách (queue lọc theo state pending/claimed/quoted, orders lọc theo
 * assignee) trong khi bộ mốc tiến độ vẫn còn nguyên mấy mốc `pending` chờ người
 * cập nhật. Lối vào duy nhất còn lại là thông báo cũ trong hộp thư. Bộ test này
 * khoá hành vi "đơn đã chốt còn mốc dở thì phải hiện lại trong my-tasks".
 */

interface WonRow {
  orderId: number;
  order: { code: string; closedAt: Date | null; updatedAt: Date; milestones: { id: number }[] };
}

function mk(wonRows: WonRow[] = []) {
  const orderFindMany = jest.fn().mockResolvedValue([]);
  // Hai nhánh cùng gọi orderDepartment.findMany — phân biệt bằng state để test
  // không phụ thuộc vào thứ tự gọi trong service.
  const odFindMany = jest.fn().mockImplementation((args: { where?: { state?: string } }) =>
    Promise.resolve(args?.where?.state === DeptState.WON ? wonRows : []),
  );
  const prisma = {
    order: { findMany: orderFindMany },
    orderDepartment: { findMany: odFindMany },
  } as unknown as PrismaService;
  return { svc: new NotificationsService(prisma), orderFindMany, odFindMany };
}

const user = (roles: Role[], departmentId: number | null = 3): AuthenticatedUser =>
  ({ id: 7, roles, departmentId }) as unknown as AuthenticatedUser;

const CLOSED_AT = new Date('2026-09-16T03:00:00.000Z');

const wonRow = (pending: number): WonRow => ({
  orderId: 101,
  order: {
    code: 'ORD-101',
    closedAt: CLOSED_AT,
    updatedAt: new Date('2026-09-16T09:00:00.000Z'),
    milestones: Array.from({ length: pending }, (_, i) => ({ id: i + 1 })),
  },
});

describe('NotificationsService.myTasks — đơn đã chốt còn mốc tiến độ dở', () => {
  it('sinh việc kèm số mốc còn lại, mốc thời gian là lúc chốt đơn', async () => {
    const { svc } = mk([wonRow(5)]);
    const tasks = await svc.myTasks(user([Role.MANAGER]));
    expect(tasks).toEqual([
      { orderId: 101, code: 'ORD-101', reason: 'Còn 5 mốc chưa cập nhật', since: CLOSED_AT },
    ]);
  });

  /** Chỉ đơn đang ở giai đoạn thực hiện mới còn mốc để cập nhật. */
  it('chỉ hỏi đơn đã chốt / đang thực hiện của phòng mình và còn mốc pending', async () => {
    const { svc, odFindMany } = mk([]);
    await svc.myTasks(user([Role.MANAGER]));
    const call = odFindMany.mock.calls.find((c) => c[0]?.where?.state === DeptState.WON);
    expect(call).toBeDefined();
    expect(call![0].where).toMatchObject({
      departmentId: 3,
      state: DeptState.WON,
      order: {
        status: OrderStatus.CLOSED,
        milestones: { some: { status: MilestoneStatus.PENDING } },
      },
    });
  });

  /**
   * Giữ đúng luật người nhận của nhánh Manager/Staff đang có: Manager thấy cả
   * phòng, Staff chỉ thấy đơn mình cầm — nếu không, mỗi nhân viên sẽ thấy toàn
   * bộ đơn đang chạy của phòng và my-tasks thành danh sách rác.
   */
  it('Staff chỉ nhận đơn mình được giao, Manager nhận cả phòng', async () => {
    const { svc: staffSvc, odFindMany: staffCalls } = mk([]);
    await staffSvc.myTasks(user([Role.STAFF]));
    const staffWhere = staffCalls.mock.calls.find((c) => c[0]?.where?.state === DeptState.WON)![0]
      .where;
    expect(staffWhere.assigneeId).toBe(7);

    const { svc: mgrSvc, odFindMany: mgrCalls } = mk([]);
    await mgrSvc.myTasks(user([Role.MANAGER]));
    const mgrWhere = mgrCalls.mock.calls.find((c) => c[0]?.where?.state === DeptState.WON)![0].where;
    expect(mgrWhere.assigneeId).toBeUndefined();
  });

  /** Sale không cập nhật mốc — không hỏi bảng phòng ban cho họ. */
  it('Sale thuần không sinh nhánh mốc tiến độ', async () => {
    const { svc, odFindMany } = mk([wonRow(2)]);
    const tasks = await svc.myTasks(user([Role.SALE], null));
    expect(odFindMany).not.toHaveBeenCalled();
    expect(tasks).toEqual([]);
  });

  /** Đơn chốt trước thì nhắc trước — gộp chung thứ tự với các nhánh việc khác. */
  it('đơn thiếu closedAt vẫn có mốc thời gian để xếp thứ tự', async () => {
    const row = wonRow(1);
    row.order.closedAt = null;
    const { svc } = mk([row]);
    const tasks = await svc.myTasks(user([Role.MANAGER]));
    expect(tasks[0].since).toEqual(row.order.updatedAt);
  });
});
