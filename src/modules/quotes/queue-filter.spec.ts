import { BadRequestException } from '@nestjs/common';
import { DeptState } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { QueueService } from './queue.service';
import { QueueQueryDto } from './dto/queue-query.dto';

/**
 * B-38: GET /queue trả thẳng tối đa 200 dòng và không nhận tham số nào. Chưa
 * gãy vì app đang cầm trọn tập đó rồi lọc tại máy — nhưng phép lọc ấy chỉ đúng
 * chừng nào phòng ban chưa quá 200 đơn đang mở. Qua mốc đó thì danh sách thiếu
 * đơn mà không có lỗi nào bật lên.
 */
/** Một dòng đủ hình dạng mà hàm map thật đọc tới — object rỗng sẽ ném ở `r.order`. */
const row = (orderId: number) => ({
  orderId,
  state: DeptState.PENDING,
  distributedAt: new Date('2026-09-18T00:00:00Z'),
  assignee: null,
  order: {
    code: `DOM-260918-${orderId}`,
    status: 'distributed',
    originProvince: 'Hà Nội',
    destinationProvince: 'Lào Cai',
    customer: { companyName: 'Công ty A' },
    service: { name: 'Vận chuyển nội địa', slaHours: 24 },
    departments: [{ departmentId: 7 }],
  },
});

function mk(rows: unknown[] = [], total = 0) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const count = jest.fn().mockResolvedValue(total);
  const prisma = {
    orderDepartment: { findMany, count },
    // Bản thật gọi $transaction([count, findMany]); bản giả chạy đúng thứ tự đó.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return { svc: new QueueService(prisma), findMany, count };
}

const user = { id: 1, departmentId: 7, roles: ['staff'] } as unknown as AuthenticatedUser;

/** DTO thật, không phải object rỗng: mặc định của nó là thứ đang được kiểm. */
const q = (over: Partial<QueueQueryDto> = {}): QueueQueryDto =>
  Object.assign(new QueueQueryDto(), over);

const whereOf = (m: jest.Mock) => m.mock.calls[0][0].where as Record<string, unknown>;
const argsOf = (m: jest.Mock) => m.mock.calls[0][0] as Record<string, unknown>;

describe('QueueService.myQueue — lọc và phân trang', () => {
  /**
   * Điểm quan trọng nhất. App hiện gọi không kèm tham số và lọc tại máy trên
   * trọn tập trả về. Hạ mặc định xuống 20 như quy ước chung của repo thì app
   * vẫn parse được, vẫn không báo lỗi, chỉ là lọc tại máy trở thành sai âm thầm.
   */
  it('không truyền gì thì vẫn lấy tới 200 dòng như trước', async () => {
    const { svc, findMany } = mk();
    await svc.myQueue(user, q());
    expect(argsOf(findMany).take).toBe(200);
    expect(argsOf(findMany).skip).toBe(0);
  });

  it('mặc định vẫn chỉ lấy ba trạng thái còn nằm trong hàng đợi', async () => {
    const { svc, findMany } = mk();
    await svc.myQueue(user, q());
    expect(whereOf(findMany).state).toEqual({
      in: [DeptState.PENDING, DeptState.CLAIMED, DeptState.QUOTED],
    });
  });

  it('có status thì lọc đúng một trạng thái đó', async () => {
    const { svc, findMany } = mk();
    await svc.myQueue(user, q({ status: DeptState.CLAIMED }));
    expect(whereOf(findMany).state).toBe(DeptState.CLAIMED);
  });

  it('luôn khoá theo phòng của người gọi', async () => {
    const { svc, findMany } = mk();
    await svc.myQueue(user, q({ status: DeptState.QUOTED }));
    expect(whereOf(findMany).departmentId).toBe(7);
  });

  /**
   * total phải là TỔNG số dòng khớp, không phải số dòng của trang. Trả về số
   * dòng trang thì client không bao giờ biết còn trang sau — đúng lỗi mà phân
   * trang sinh ra để tránh.
   */
  it('total là tổng số dòng khớp, không phải số dòng trong trang', async () => {
    const { svc } = mk([row(1), row(2)], 87);
    const res = await svc.myQueue(user, q({ limit: 2 }));
    expect(res.total).toBe(87);
    expect(res.items).toHaveLength(2);
  });

  it('count đếm trên cùng bộ lọc với findMany', async () => {
    const { svc, findMany, count } = mk();
    await svc.myQueue(user, q({ status: DeptState.PENDING }));
    expect(count.mock.calls[0][0].where).toEqual(whereOf(findMany));
  });

  it('trang 2 nhảy đúng số dòng', async () => {
    const { svc, findMany } = mk();
    await svc.myQueue(user, q({ page: 2, limit: 50 }));
    expect(argsOf(findMany).skip).toBe(50);
    expect(argsOf(findMany).take).toBe(50);
  });

  it('trả lại đúng page và limit đã dùng', async () => {
    const { svc } = mk([], 0);
    const res = await svc.myQueue(user, q({ page: 3, limit: 10 }));
    expect(res.page).toBe(3);
    expect(res.limit).toBe(10);
  });

  /**
   * Nhiều đơn được phân phối trong cùng một giây là chuyện thường. Khi
   * distributedAt bằng nhau, thứ tự giữa các dòng đó KHÔNG xác định — trang 1
   * và trang 2 có thể cùng trả một đơn và cùng bỏ sót một đơn khác. Không phân
   * trang thì lỗi này vô hình; có phân trang thì nó hiện ra ngay.
   */
  it('sắp xếp ổn định: có khoá phụ để hai dòng cùng thời điểm không đảo chỗ', async () => {
    const { svc, findMany } = mk();
    await svc.myQueue(user, q());
    expect(argsOf(findMany).orderBy).toEqual([
      { distributedAt: 'desc' },
      { orderId: 'desc' },
    ]);
  });

  /**
   * Đơn vừa phân về phải nằm TRÊN CÙNG. Cũ nhất lên đầu thì đơn mới rơi xuống
   * dưới 11-16 đơn chờ cũ, và nhân viên báo "không thấy đơn mới".
   */
  it('don moi nhat len dau', async () => {
    const { svc, findMany } = mk();
    await svc.myQueue(user, q());
    expect((argsOf(findMany).orderBy as unknown[])[0]).toEqual({ distributedAt: 'desc' });
  });

  /** Hành vi cũ, đừng làm hồi quy. */
  it('tài khoản chưa thuộc phòng nào vẫn bị từ chối', async () => {
    const { svc } = mk();
    await expect(
      svc.myQueue({ ...user, departmentId: null } as AuthenticatedUser, q()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
