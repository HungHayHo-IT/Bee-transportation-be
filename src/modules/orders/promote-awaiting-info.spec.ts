import { OrderStatus } from '@/common/enums';
import { OrdersService } from './orders.service';

/**
 * Nhập nốt điểm đến rồi bấm Lưu mà đơn vẫn nằm trong hàng chờ thì nhân viên
 * không có cách nào đẩy nó đi tiếp — không có nút nào làm việc đó.
 *
 * Cố tình KHÔNG làm nút "Xác nhận đủ thông tin": thêm một bước thủ công là thêm
 * một chỗ để quên, và đơn sẽ nằm lại dù dữ liệu đã đủ.
 */
function mkPromote(opts: {
  status: OrderStatus;
  originProvince: string | null;
  destinationProvince: string | null;
  deptCount: number;
  /** Người đang đứng tên đơn. Bỏ trống = đơn khách tự gửi, chưa ai đứng tên. */
  createdBy?: number | null;
}) {
  const orderUpdate = jest.fn().mockResolvedValue({ id: 77 });
  const deptCreateMany = jest.fn().mockResolvedValue({ count: opts.deptCount });
  const orderSnapshot = {
    id: 77,
    status: opts.status,
    serviceId: 3,
    originProvince: opts.originProvince,
    destinationProvince: opts.destinationProvince,
    serviceData: {},
    customer: { companyName: 'A', phone: '090' },
    service: { name: 'Thuê xe' },
    createdBy: opts.createdBy ?? null,
  };
  const tx = {
    order: { update: orderUpdate },
    orderDepartment: { createMany: deptCreateMany },
    department: { findMany: jest.fn().mockResolvedValue(
      Array.from({ length: opts.deptCount }, (_, i) => ({ id: i + 1 })),
    ) },
  };
  const prisma = {
    order: { findUniqueOrThrow: jest.fn().mockResolvedValue(orderSnapshot) },
    // update() huỷ mọi yêu cầu ký đang chờ của đơn — xem huy-cho-ky.ts. Bản giả
    // phải có cửa này, không thì test đỏ vì thiếu đồ giả chứ không vì mã sai.
    orderSignature: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    // create()/update() nay tra dich vu con dang bat de biet don co phai
    // chon them khong — xem dich-vu-con.helper. Thieu cua nay thi test do
    // vi thieu do gia chu khong vi ma sai.
    serviceChild: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const serviceData = {
    assertCargoAllowed: jest.fn(),
    cargoFieldsOf: jest.fn().mockResolvedValue([]),
    requiredFieldsOf: jest.fn().mockResolvedValue([]),
  };
  // Thứ tự tham số PHẢI khớp constructor thật (orders.service.ts):
  // prisma, activity, notify, query, customers, diaChiKhach, serviceData,
  // customerNotify.
  const svc = new OrdersService(
    prisma as never,
    { log: jest.fn() } as never,
    { push: jest.fn(), adminsAndSales: jest.fn().mockResolvedValue([1]), deptRecipients: jest.fn().mockResolvedValue([9]) } as never,
    { detail: jest.fn().mockResolvedValue({ id: 77 }), findScoped: jest.fn().mockResolvedValue(orderSnapshot) } as never,
    { findByName: jest.fn().mockResolvedValue(null) } as never,
    // DiaChiKhachService — ghi nho dia chi khach, viec PHU cua tao don.
    { ghiNho: jest.fn().mockResolvedValue(null), maTheoDiaChi: jest.fn() } as never,
    serviceData as never,
    { quoteRequestReceived: jest.fn() } as never,
  );
  return { svc, orderUpdate, deptCreateMany };
}

describe('sửa đơn chờ bổ sung không cần changeNote', () => {
  /**
   * Trước khi sửa, update() đòi changeNote với mọi trạng thái ngoài beforeClose
   * và awaiting_info không có trong đó — nhân viên nhập nốt điểm đến bị chặn
   * bằng thông báo "Sửa đơn đã chốt bắt buộc phải có ghi chú lý do".
   */
  it('sửa đơn chờ bổ sung KHÔNG cần changeNote', async () => {
    const { svc } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: null, deptCount: 2,
    });
    await expect(
      svc.update(77, { destinationProvince: 'Lào Cai' } as never, { id: 1, roles: ['admin'] } as never),
    ).resolves.toBeDefined();
  });
});

describe('promoteIfComplete — thoát awaiting_info khi đã đủ', () => {
  it('nhập đủ thì chuyển sang distributed và sinh order_departments', async () => {
    const { svc, orderUpdate, deptCreateMany } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
    });
    await svc.update(77, { originProvince: 'Hà Nội' } as never, { id: 1, roles: ['admin'] } as never);
    expect(orderUpdate.mock.calls.at(-1)?.[0].data.status).toBe(OrderStatus.DISTRIBUTED);
    expect(deptCreateMany).toHaveBeenCalled();
  });

  it('dịch vụ không có phòng nào thì chuyển sang new', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 0,
    });
    await svc.update(77, {} as never, { id: 1, roles: ['admin'] } as never);
    expect(orderUpdate.mock.calls.at(-1)?.[0].data.status).toBe(OrderStatus.NEW);
  });

  it('còn thiếu thì ở nguyên awaiting_info', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: null, deptCount: 2,
    });
    await svc.update(77, {} as never, { id: 1, roles: ['admin'] } as never);
    const statuses = orderUpdate.mock.calls.map((c) => c[0].data.status).filter(Boolean);
    expect(statuses).not.toContain(OrderStatus.DISTRIBUTED);
  });

  /** Đơn đang báo giá dở KHÔNG được chạm tới — đây là chỗ dễ gây hồi quy nhất. */
  it('đơn không ở awaiting_info thì không đụng trạng thái', async () => {
    const { svc, orderUpdate, deptCreateMany } = mkPromote({
      status: OrderStatus.QUOTING,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
    });
    await svc.update(77, {} as never, { id: 1, roles: ['admin'] } as never);
    const statuses = orderUpdate.mock.calls.map((c) => c[0].data.status).filter(Boolean);
    expect(statuses).toEqual([]);
    expect(deptCreateMany).not.toHaveBeenCalled();
  });
});


describe('sale hoàn thiện đơn thì thành sale phụ trách', () => {
  const SALE = { id: 42, roles: ['sale'] } as never;
  const ADMIN = { id: 7, roles: ['admin'] } as never;
  const dataOf = (m: jest.Mock) =>
    m.mock.calls.map((c) => c[0].data as Record<string, unknown>);

  /**
   * Đơn khách tự gửi từ landing chưa đứng tên ai (created_by NULL). Mọi cửa dành
   * cho Sale đều hỏi `createdBy === user.id`: phạm vi đọc, ownedOrder() của
   * selectQuote, và close(). Nên sau khi Sale nhập nốt thông tin và bấm Lưu,
   * chính họ MẤT quyền đọc đơn vừa làm — API trả 404 dù dữ liệu đã lưu xong, và
   * không Sale nào chọn được báo giá thắng cho đơn đó nữa.
   */
  it('Sale nhập nốt thông tin thì đơn về tay họ', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
    });
    await svc.update(77, {} as never, SALE);
    expect(dataOf(orderUpdate).some((d) => d.createdBy === 42)).toBe(true);
  });

  /** Admin đã đọc được mọi đơn; cướp quyền đứng tên của họ chỉ làm sai sổ sách. */
  it('Admin hoàn thiện thì KHÔNG đổi người đứng tên', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
    });
    await svc.update(77, {} as never, ADMIN);
    expect(dataOf(orderUpdate).every((d) => d.createdBy === undefined)).toBe(true);
  });

  /**
   * Đơn đã có sale đứng tên thật thì không ai giành được — chỉ đơn chưa ai đứng tên
   * mới là đơn chưa có chủ.
   */
  it('đơn đã có sale khác đứng tên thì giữ nguyên', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.AWAITING_INFO,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
      createdBy: 55,
    });
    await svc.update(77, {} as never, SALE);
    expect(dataOf(orderUpdate).every((d) => d.createdBy === undefined)).toBe(true);
  });

  /** Đơn không ở awaiting_info thì không đụng gì — giữ nguyên lưới an toàn cũ. */
  it('đơn đang báo giá dở thì không đổi người đứng tên', async () => {
    const { svc, orderUpdate } = mkPromote({
      status: OrderStatus.QUOTING,
      originProvince: 'Hà Nội', destinationProvince: 'Lào Cai', deptCount: 2,
    });
    await svc.update(77, {} as never, SALE);
    expect(dataOf(orderUpdate).every((d) => d.createdBy === undefined)).toBe(true);
  });
});
