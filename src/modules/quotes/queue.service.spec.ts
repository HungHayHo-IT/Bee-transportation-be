import { DeptState, OrderStatus } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { QueueService } from './queue.service';
import { QueueQueryDto } from './dto/queue-query.dto';

const user: AuthenticatedUser = {
  id: 7,
  email: 'nv@bee.vn',
  fullName: 'NV',
  roles: ['staff'],
  departmentId: 3,
  canViewCompanyReport: false,
  mustChangePassword: false,
};

/** Một dòng hàng đợi: phòng chưa tiếp nhận, nhưng đơn thì đã bị hủy. */
const cancelledRow = {
  orderId: 11,
  state: DeptState.PENDING,
  assignee: null,
  distributedAt: new Date('2026-08-25T00:00:00Z'),
  order: {
    code: 'DOM-20260825-008',
    status: OrderStatus.CANCELLED,
    originProvince: 'Hà Nội',
    destinationProvince: 'TP. Hồ Chí Minh',
    customer: { companyName: 'QA25-Customer-003' },
    service: { name: 'Vận chuyển nội địa', slaHours: 4 },
    departments: [{ departmentId: 3 }],
  },
};

const mkService = (rows: unknown[]): QueueService =>
  new QueueService({
    orderDepartment: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService);

/** Tham số mặc định — các test dưới đây đo phép ánh xạ, không đo phân trang. */
const q = (): QueueQueryDto => new QueueQueryDto();

/** Lấy dòng đầu ra khỏi vỏ phân trang, để phần khẳng định giữ nguyên như cũ. */
const firstItem = async (rows: unknown[]) =>
  (await mkService(rows).myQueue(user, q())).items[0]!;

describe('QueueService.myQueue', () => {
  /**
   * Hủy đơn chỉ đổi orders.status, KHÔNG đụng order_departments.state — nên hàng đợi
   * phải tự đọc trạng thái đơn, nếu không màn hình mời người dùng nhận một đơn mà
   * backend chắc chắn từ chối.
   */
  it('trả về trạng thái ĐƠN chứ không chỉ trạng thái phòng', async () => {
    const item = await firstItem([cancelledRow]);
    expect(item.state).toBe(DeptState.PENDING);
    expect(item.orderStatus).toBe(OrderStatus.CANCELLED);
  });

  it('đơn đã hủy KHÔNG bị tính là quá hạn SLA — không còn ai phải làm gì nữa', async () => {
    const item = await firstItem([cancelledRow]);
    expect(item.slaLate).toBe(false);
  });

  it('đơn còn làm được thì quá hạn SLA vẫn báo như cũ', async () => {
    const live = { ...cancelledRow, order: { ...cancelledRow.order, status: OrderStatus.DISTRIBUTED } };
    const item = await firstItem([live]);
    expect(item.orderStatus).toBe(OrderStatus.DISTRIBUTED);
    expect(item.slaLate).toBe(true);
  });
});
