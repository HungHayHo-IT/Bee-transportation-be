import { OrderStatus } from '@/common/enums';
import { BACKFILLABLE_STATUSES, backfillOpenOrders } from './department-routing.helper';

/**
 * Ma trận định tuyến sửa xong thì đơn CŨ chưa chốt giá phải chảy về phòng mới.
 *
 * Trước đây định tuyến chỉ chạy đúng một lần, lúc tạo đơn. Gán thêm dịch vụ cho
 * một phòng thì phòng đó chỉ nhận được đơn tạo SAU đó — đơn đang nằm chờ báo giá
 * vẫn vô hình với họ, và không có gì trên màn hình nói ra điều ấy.
 */

type Order = { id: number; status: OrderStatus };

function fakeTx(orders: Order[]) {
  const calls = {
    created: [] as { orderId: number; departmentId: number }[],
    promoted: [] as number[],
    where: null as unknown,
  };
  return {
    calls,
    tx: {
      order: {
        findMany: async (args: { where: unknown }) => {
          calls.where = args.where;
          return orders.map((o) => ({ id: o.id, status: o.status }));
        },
        updateMany: async (args: { where: { id: { in: number[] } } }) => {
          calls.promoted.push(...args.where.id.in);
          return { count: args.where.id.in.length };
        },
      },
      orderDepartment: {
        createMany: async (args: {
          data: { orderId: number; departmentId: number }[];
        }) => {
          calls.created.push(...args.data);
          return { count: args.data.length };
        },
      },
    },
  };
}

const DEPT = { id: 7, serviceIds: [1, 2], isActive: true, isQuoting: true };

describe('backfillOpenOrders', () => {
  /* Chỉ Phòng báo giá được chia đơn (080): phòng khác tích dịch vụ là để
     Điều vận / Trưởng phòng XEM đơn đã chốt, không phải để báo giá. */
  it('phòng không phải Phòng báo giá thì không chia đơn nào', async () => {
    const { tx, calls } = fakeTx([{ id: 10, status: OrderStatus.DISTRIBUTED }]);
    expect(await backfillOpenOrders(tx, { ...DEPT, isQuoting: false })).toEqual([]);
    expect(calls.created).toEqual([]);
  });

  it('thêm phòng vào mọi đơn chưa chốt giá của dịch vụ nó phụ trách', async () => {
    const { tx, calls } = fakeTx([
      { id: 10, status: OrderStatus.DISTRIBUTED },
      { id: 11, status: OrderStatus.QUOTING },
    ]);
    const touched = await backfillOpenOrders(tx, DEPT);
    expect(touched).toEqual([10, 11]);
    expect(calls.created).toEqual([
      { orderId: 10, departmentId: 7 },
      { orderId: 11, departmentId: 7 },
    ]);
  });

  /**
   * "Chưa chốt giá" gồm cả 'awaiting_selection' — nhãn của nó đọc đúng là "Chờ
   * chốt giá". Đơn đã chốt hoặc đã huỷ thì vòng giá đóng rồi, thêm phòng vào chỉ
   * làm bẩn dữ liệu.
   */
  it('bốn trạng thái còn mở, không có closed và cancelled', () => {
    expect(BACKFILLABLE_STATUSES).toEqual([
      OrderStatus.NEW,
      OrderStatus.DISTRIBUTED,
      OrderStatus.QUOTING,
      OrderStatus.AWAITING_SELECTION,
    ]);
    expect(BACKFILLABLE_STATUSES).not.toContain(OrderStatus.CLOSED);
    expect(BACKFILLABLE_STATUSES).not.toContain(OrderStatus.CANCELLED);
    // Đơn còn thiếu thông tin chưa được phân phối cho ai cả; nó tự chạy định
    // tuyến khi được điền nốt, và nó phải giữ nguyên đường đó.
    expect(BACKFILLABLE_STATUSES).not.toContain(OrderStatus.AWAITING_INFO);
  });

  /**
   * Sale đã chọn phòng thắng thì giá coi như đã chốt xong phần đấu giá, chỉ còn
   * chờ khách gật. Thêm một phòng vào lúc này là mời họ báo một cái giá không
   * bao giờ được chọn — selection.service chặn chọn lần hai.
   */
  it('bỏ qua đơn đã chọn được phòng thắng', async () => {
    const { tx, calls } = fakeTx([]);
    await backfillOpenOrders(tx, DEPT);
    expect(calls.where).toMatchObject({ departmentId: null });
  });

  it('chỉ lấy đơn thuộc dịch vụ phòng phụ trách, và bỏ đơn phòng đã có mặt', async () => {
    const { tx, calls } = fakeTx([]);
    await backfillOpenOrders(tx, DEPT);
    expect(calls.where).toMatchObject({
      serviceId: { in: [1, 2] },
      status: { in: BACKFILLABLE_STATUSES },
      departments: { none: { departmentId: 7 } },
    });
  });

  /** Đơn 'new' là đơn chưa phòng nào nhận; có phòng rồi thì nó đã phân phối. */
  it('kéo đơn new lên distributed, không đụng trạng thái khác', async () => {
    const { tx, calls } = fakeTx([
      { id: 20, status: OrderStatus.NEW },
      { id: 21, status: OrderStatus.QUOTING },
    ]);
    await backfillOpenOrders(tx, DEPT);
    expect(calls.promoted).toEqual([20]);
  });

  it('phòng ngừng hoạt động thì không nhận gì', async () => {
    const { tx, calls } = fakeTx([{ id: 30, status: OrderStatus.DISTRIBUTED }]);
    const touched = await backfillOpenOrders(tx, { ...DEPT, isActive: false });
    expect(touched).toEqual([]);
    expect(calls.created).toEqual([]);
  });

  it('phòng chưa phụ trách dịch vụ nào thì không chạm vào đơn nào', async () => {
    const { tx, calls } = fakeTx([{ id: 31, status: OrderStatus.DISTRIBUTED }]);
    const touched = await backfillOpenOrders(tx, { ...DEPT, serviceIds: [] });
    expect(touched).toEqual([]);
    expect(calls.created).toEqual([]);
  });

  it('không có đơn nào khớp thì không ghi gì', async () => {
    const { tx, calls } = fakeTx([]);
    const touched = await backfillOpenOrders(tx, DEPT);
    expect(touched).toEqual([]);
    expect(calls.created).toEqual([]);
    expect(calls.promoted).toEqual([]);
  });
});
