import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { DeptState, NotifType, OrderStatus } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '../notifications/notify.service';
import { QuotesService } from './quotes.service';

const manager: AuthenticatedUser = {
  id: 7, email: 'tp@bee.vn', fullName: 'Trưởng phòng', roles: ['manager'],
  departmentId: 3, canViewCompanyReport: false, mustChangePassword: false,
};

interface Opts {
  orderStatus?: OrderStatus;
  sourceState?: DeptState;
  targetExists?: boolean;
  targetActive?: boolean;
  otherDeptWon?: boolean;
}

/**
 * Prisma giả: $transaction gọi thẳng callback với cùng bộ stub, nên thứ tự các
 * lời gọi bên trong transaction quan sát được qua invocationCallOrder.
 */
function mkHarness(opts: Opts = {}) {
  const {
    orderStatus = OrderStatus.DISTRIBUTED,
    sourceState = DeptState.PENDING,
    targetExists = false,
    targetActive = true,
    otherDeptWon = false,
  } = opts;

  // departments: dùng bởi notifyAfterSettle nếu nó lỡ được gọi lại (Phát hiện 2) —
  // để test "không bao giờ bắn ALL_PASSED" fail vì đúng lý do (còn thấy ALL_PASSED
  // trong danh sách push), chứ không phải vì TypeError khi đọc order.departments.
  const order = {
    id: 11, code: 'DOM-20260904-001', status: orderStatus, createdBy: 99,
    departments: [{ state: DeptState.PASSED }, { state: DeptState.PENDING }],
  };

  const stub = {
    order: {
      findFirst: jest.fn().mockResolvedValue(order),
      findUnique: jest.fn().mockResolvedValue(order),
      findUniqueOrThrow: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue(order),
    },
    orderDepartment: {
      findUnique: jest.fn(({ where }: { where: { orderId_departmentId: { departmentId: number } } }) =>
        Promise.resolve(
          where.orderId_departmentId.departmentId === 3
            ? { orderId: 11, departmentId: 3, state: sourceState, claimedAt: null }
            : targetExists
              ? { orderId: 11, departmentId: 5, state: DeptState.PENDING }
              : null,
        ),
      ),
      // findMany được dùng ở hai chỗ: guard won/lost cấp đơn (trước transaction) và
      // settleCheck (trong transaction, sau khi đã tạo dòng đích) — cùng một mock,
      // nên cả hai đọc cùng ảnh chụp trong bài test này.
      findMany: jest.fn().mockResolvedValue(
        otherDeptWon
          ? [{ state: DeptState.WON }, { state: DeptState.PENDING }]
          : [{ state: DeptState.PASSED }, { state: DeptState.PENDING }],
      ),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    department: {
      findUnique: jest.fn().mockResolvedValue(
        targetActive ? { id: 5, name: 'Phòng Quốc tế', isActive: true, isQuoting: true } : { id: 5, name: 'Phòng Quốc tế', isActive: false },
      ),
    },
  };

  const prisma = {
    ...stub,
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(stub)),
  } as unknown as PrismaService;

  const notify = {
    push: jest.fn().mockResolvedValue(undefined),
    deptRecipients: jest.fn().mockResolvedValue([21, 22]),
    admins: jest.fn().mockResolvedValue([1]),
  } as unknown as NotifyService;

  const service = new QuotesService(
    prisma,
    { orderWhere: () => ({}) } as unknown as ScopeService,
    { log: jest.fn().mockResolvedValue(undefined) } as unknown as ActivityService,
    notify,
    {} as never,
  );

  return { service, stub, notify };
}

const body = { toDepartmentId: 5, reason: 'Không thuộc chuyên môn phòng' };

describe('QuotesService.transfer', () => {
  it('đóng dòng phòng nguồn thành passed kèm lý do', async () => {
    const { service, stub } = mkHarness();
    await service.transfer(11, 3, body, manager);
    expect(stub.orderDepartment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId_departmentId: { orderId: 11, departmentId: 3 } },
        data: { state: DeptState.PASSED, passReason: body.reason },
      }),
    );
  });

  it('mở dòng phòng đích ở pending và đánh dấu thủ công', async () => {
    const { service, stub } = mkHarness();
    await service.transfer(11, 3, body, manager);
    expect(stub.orderDepartment.create).toHaveBeenCalledWith({
      data: { orderId: 11, departmentId: 5, state: DeptState.PENDING, isManual: true },
    });
  });

  /**
   * Test chốt. settleCheck đọc order_departments; nếu nó chạy trước khi dòng đích
   * tồn tại thì đơn thoáng qua trạng thái "mọi phòng đã trả lời" và sale nhận một
   * thông báo ALL_PASSED cho đơn vừa được chuyển đi tiếp.
   */
  it('settleCheck chạy SAU khi tạo dòng phòng đích', async () => {
    const { service, stub } = mkHarness();
    await service.transfer(11, 3, body, manager);
    const created = stub.orderDepartment.create.mock.invocationCallOrder[0];
    // findMany được gọi hai lần: guard won/lost cấp đơn TRƯỚC transaction, rồi
    // settleCheck TRONG transaction — lần gọi settleCheck là lần cuối cùng.
    const settled = stub.orderDepartment.findMany.mock.invocationCallOrder.at(-1);
    expect(settled).toBeGreaterThan(created);
  });

  it('không bao giờ bắn ALL_PASSED — luôn còn một phòng đang chờ', async () => {
    const { service, notify } = mkHarness();
    await service.transfer(11, 3, body, manager);
    const types = (notify.push as jest.Mock).mock.calls
      .flatMap(([rows]: [{ type: string }[]]) => rows.map((r) => r.type));
    expect(types).not.toContain(NotifType.ALL_PASSED);
    expect(types).toContain(NotifType.NEW_ORDER);
  });

  it('báo cho người của phòng đích', async () => {
    const { service, notify } = mkHarness();
    await service.transfer(11, 3, body, manager);
    expect(notify.deptRecipients).toHaveBeenCalledWith(null, 11, 5);
    expect(notify.push).toHaveBeenCalledWith([
      { userId: 21, orderId: 11, type: NotifType.NEW_ORDER, title: 'Đơn DOM-20260904-001 được chuyển tới phòng bạn' },
      { userId: 22, orderId: 11, type: NotifType.NEW_ORDER, title: 'Đơn DOM-20260904-001 được chuyển tới phòng bạn' },
    ]);
  });

  it('phòng đích đã tham gia đơn thì từ chối', async () => {
    const { service } = mkHarness({ targetExists: true });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(ConflictException);
  });

  it('phòng đích trùng phòng nguồn thì từ chối', async () => {
    const { service } = mkHarness();
    await expect(
      service.transfer(11, 3, { ...body, toDepartmentId: 3 }, manager),
    ).rejects.toThrow(BadRequestException);
  });

  it('phòng đích đã ngừng hoạt động thì từ chối', async () => {
    const { service } = mkHarness({ targetActive: false });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(BadRequestException);
  });

  it('đơn đã qua vòng chọn báo giá thì không chuyển được nữa', async () => {
    const { service } = mkHarness({ sourceState: DeptState.WON });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(BadRequestException);
  });

  /**
   * Guard trên dòng nguồn chỉ bắt được trường hợp CHÍNH phòng đang chuyển đã
   * won/lost. Nhưng transfer thêm một phòng MỚI — nếu một phòng KHÁC đã
   * won/lost (đơn đã chọn xong báo giá) thì dòng nguồn vẫn có thể đang 'passed'
   * và lọt qua guard đó. Phải chặn ở cấp đơn.
   */
  it('phòng khác đã chọn xong báo giá (won/lost) thì từ chối', async () => {
    const { service } = mkHarness({ otherDeptWon: true });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(BadRequestException);
  });

  it('đơn đã huỷ thì không chuyển được', async () => {
    const { service } = mkHarness({ orderStatus: OrderStatus.CANCELLED });
    await expect(service.transfer(11, 3, body, manager)).rejects.toThrow(ConflictException);
  });

  it('không phải phòng mình thì 403', async () => {
    const { service } = mkHarness();
    await expect(service.transfer(11, 4, body, manager)).rejects.toThrow(ForbiddenException);
  });
});
