import { ActivityService } from '@/common/activity/activity.service';
import { CustomerNotifType, MilestoneStatus, OrderStatus, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { NotifyService } from '@/modules/notifications/notify.service';
import { MilestonesService } from './milestones.service';

const USER = {
  id: 1, email: 'a@b.c', fullName: 'A', roles: [Role.ADMIN],
  departmentId: 2, canViewCompanyReport: true, mustChangePassword: false,
} as AuthenticatedUser;

// 'closed' là nơi đơn đứng suốt lúc giao hàng — tick mốc không còn đổi trạng
// thái nữa (migration 023). completedAt null = chưa từng tick hết mốc.
const ORDER = {
  id: 3, code: 'BOP-250914-01', status: OrderStatus.CLOSED,
  departmentId: 2, createdBy: 1, completedAt: null,
};

/**
 * `remaining` = số mốc còn PENDING sau khi cập nhật; 0 nghĩa là đơn vừa xong.
 *
 * Khi remaining = 0 thì mốc seq 1 PHẢI đã DONE: `update()` chặn cập nhật mốc sau
 * khi mốc trước còn PENDING ("Phải xử lý mốc ... trước"), nên để PENDING ở đây là
 * test ném lỗi trước khi chạm tới phần thông báo.
 */
function mk(remaining: number) {
  const orderEvent = jest.fn().mockResolvedValue(undefined);
  const firstStatus = remaining === 0 ? MilestoneStatus.DONE : MilestoneStatus.PENDING;
  const milestones = [
    { id: 10, seq: 1, name: 'Đã lấy hàng', status: firstStatus, note: null, doneAt: null },
    { id: 11, seq: 2, name: 'Nghiệm thu', status: MilestoneStatus.PENDING, note: null, doneAt: null },
  ];
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue(ORDER), update: jest.fn() },
    orderMilestone: {
      findMany: jest.fn().mockResolvedValue(milestones.map((m) => ({ ...m, user: null }))),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(remaining),
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          orderMilestone: { update: jest.fn(), count: jest.fn().mockResolvedValue(remaining) },
          order: { update: jest.fn() },
        }),
      ),
  } as unknown as PrismaService;

  const svc = new MilestonesService(
    prisma,
    { orderWhere: () => ({}), orderReadWhere: () => ({}) } as unknown as ScopeService,
    { log: jest.fn() } as unknown as ActivityService,
    { push: jest.fn().mockResolvedValue(undefined) } as unknown as NotifyService,
    { orderEvent } as unknown as CustomerNotifyService,
  );
  return { svc, orderEvent };
}

describe('MilestonesService.update — thông báo cho khách', () => {
  it('mốc hoàn thành thì bắn ORDER_MILESTONE kèm mã đơn và tên mốc', async () => {
    const { svc, orderEvent } = mk(1);
    await svc.update(3, 10, { status: MilestoneStatus.DONE }, USER);
    const call = orderEvent.mock.calls.find(
      (c) => c[1] === CustomerNotifType.ORDER_MILESTONE,
    );
    expect(call).toBeDefined();
    expect(call![0]).toBe(3);
    expect(call![2]).toBe('Đơn BOP-250914-01: Đã lấy hàng');
  });

  /** Bỏ qua mốc là chuyện điều hành nội bộ — báo cho khách chỉ gây hoang mang. */
  it('mốc bị bỏ qua thì KHÔNG bắn cho khách', async () => {
    const { svc, orderEvent } = mk(1);
    await svc.update(3, 10, { status: MilestoneStatus.SKIPPED, note: 'Khách tự lấy' }, USER);
    expect(
      orderEvent.mock.calls.some((c) => c[1] === CustomerNotifType.ORDER_MILESTONE),
    ).toBe(false);
  });

  it('mốc cuối xong (remaining = 0) thì bắn thêm ORDER_COMPLETED', async () => {
    const { svc, orderEvent } = mk(0);
    await svc.update(3, 11, { status: MilestoneStatus.DONE }, USER);
    const types = orderEvent.mock.calls.map((c) => c[1]);
    expect(types).toContain(CustomerNotifType.ORDER_MILESTONE);
    expect(types).toContain(CustomerNotifType.ORDER_COMPLETED);
  });

  /**
   * Lưu lại một mốc ĐÃ DONE (sửa ghi chú, sửa lỗi chính tả) không phải sự kiện mới
   * với khách. Nhân viên chịu được MILESTONE_UPDATED trùng vì nó nằm trong hộp
   * thư; đây là push thẳng ra điện thoại và dòng của khách không có dedupe_key.
   */
  it('lưu lại mốc đã DONE (DONE -> DONE) thì KHÔNG bắn cho khách', async () => {
    // mk(0): mốc seq 1 (id 10) đã ở DONE sẵn — đúng tình huống lưu đè.
    const { svc, orderEvent } = mk(0);
    await svc.update(3, 10, { status: MilestoneStatus.DONE, note: 'Sửa chính tả' }, USER);
    expect(
      orderEvent.mock.calls.some((c) => c[1] === CustomerNotifType.ORDER_MILESTONE),
    ).toBe(false);
  });

  it('còn mốc PENDING thì KHÔNG bắn ORDER_COMPLETED', async () => {
    const { svc, orderEvent } = mk(1);
    await svc.update(3, 10, { status: MilestoneStatus.DONE }, USER);
    expect(
      orderEvent.mock.calls.some((c) => c[1] === CustomerNotifType.ORDER_COMPLETED),
    ).toBe(false);
  });
});
