import { OrderStatus } from '@/common/enums';
import { OperationsService } from './operations.service';

/**
 * Phễu dựng theo FUNNEL_ORDER chứ không theo dữ liệu trả về, nên trạng thái nào
 * không có tên trong danh sách đó thì dòng GROUP BY của nó bị `.map` vứt đi
 * lặng lẽ. Admin đối chiếu phễu với danh sách đơn thấy hụt số mà không có cách
 * nào lần ra phần chênh.
 */
function mk(rows: { status: string; c: number }[]) {
  return new OperationsService({ $queryRaw: jest.fn().mockResolvedValue(rows) } as never);
}

const scope = { level: 'company' } as never;
const filter = {} as never;

describe('phễu vận hành có awaiting_info', () => {
  it('đếm được đơn đang chờ bổ sung', async () => {
    const steps = await mk([{ status: OrderStatus.AWAITING_INFO, c: 4 }]).funnel(scope, filter);
    expect(steps.find((s) => s.status === OrderStatus.AWAITING_INFO)?.orderCount).toBe(4);
  });

  /** Chờ bổ sung là bước TRƯỚC 'new': đơn chưa đủ dữ liệu để vào hàng đợi. */
  it('đứng đầu phễu, trước new', async () => {
    const steps = await mk([]).funnel(scope, filter);
    expect(steps.map((s) => s.status).slice(0, 2)).toEqual([
      OrderStatus.AWAITING_INFO, OrderStatus.NEW,
    ]);
  });
});
