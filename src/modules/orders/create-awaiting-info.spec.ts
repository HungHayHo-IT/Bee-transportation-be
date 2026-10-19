import { OrderStatus } from '@/common/enums';
import { OrdersService } from './orders.service';

/**
 * Đơn từ form báo giá công khai thiếu điểm đi lẫn điểm đến mà vẫn được gán
 * 'distributed' và phân cho phòng ban — phòng ban mở ra không có gì để báo giá.
 * Đây là hành vi đang sai trên production.
 */
function mk(deptCount: number) {
  const orderCreate = jest.fn().mockResolvedValue({ id: 77 });
  const deptCreateMany = jest.fn().mockResolvedValue({ count: deptCount });
  const tx = {
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ today: new Date('2026-09-18') }])
      .mockResolvedValueOnce([{ no: 1 }])
      .mockResolvedValueOnce([{ code: 'RNT-260918-01' }]),
    customer: { create: jest.fn().mockResolvedValue({ id: 5 }) },
    department: { findMany: jest.fn().mockResolvedValue(
      Array.from({ length: deptCount }, (_, i) => ({ id: i + 1 })),
    ) },
    order: { create: orderCreate },
    orderDepartment: { createMany: deptCreateMany },
  };
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue({ id: 3, name: 'Thuê xe', isActive: true, cargoFields: [] }) },
    // create()/update() nay tra dich vu con dang bat de biet don co phai
    // chon them khong — xem dich-vu-con.helper. Thieu cua nay thi test do
    // vi thieu do gia chu khong vi ma sai.
    serviceChild: { findMany: jest.fn().mockResolvedValue([]) },
    order: { findUniqueOrThrow: jest.fn().mockResolvedValue({ code: 'RNT-260918-01', source: 'website' }) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const serviceData = {
    assertCargoAllowed: jest.fn(),
    validate: jest.fn().mockResolvedValue({}),
    requiredFieldsOf: jest.fn().mockResolvedValue([]),
  };
  // Thứ tự tham số PHẢI khớp constructor thật (orders.service.ts:19-26):
  // prisma, activity, notify, query, customers, diaChiKhach, serviceData,
  // customerNotify.
  const svc = new OrdersService(
    prisma as never,
    { log: jest.fn() } as never,
    { push: jest.fn(), adminsAndSales: jest.fn().mockResolvedValue([1]), deptRecipients: jest.fn().mockResolvedValue([9]) } as never,
    { detail: jest.fn().mockResolvedValue({ id: 77 }), findScoped: jest.fn() } as never,
    { findByName: jest.fn().mockResolvedValue(null) } as never,
    // DiaChiKhachService — ghi nho dia chi khach, viec PHU cua tao don.
    { ghiNho: jest.fn().mockResolvedValue(null), maTheoDiaChi: jest.fn() } as never,
    serviceData as never,
    { quoteRequestReceived: jest.fn() } as never,
  );
  return { svc, orderCreate, deptCreateMany, tx };
}

const publicDto = {
  serviceId: 3,
  newCustomer: { companyName: 'Khách lạ', phone: '0900000000' },
  source: 'website',
};

const user = { id: 1, roles: ['sale'] } as never;

describe('create() — đơn từ form công khai còn thiếu thông tin', () => {
  it('dừng ở awaiting_info thay vì distributed', async () => {
    const { svc, orderCreate } = mk(2);
    await svc.create(publicDto as never, user, { fromPublicForm: true });
    expect(orderCreate.mock.calls[0][0].data.status).toBe(OrderStatus.AWAITING_INFO);
  });

  /** Chặn ở đây mới là thứ giữ đơn thiếu dữ liệu ra khỏi hàng đợi phòng ban. */
  it('KHÔNG phân phối cho phòng ban', async () => {
    const { svc, deptCreateMany } = mk(2);
    await svc.create(publicDto as never, user, { fromPublicForm: true });
    expect(deptCreateMany).not.toHaveBeenCalled();
  });

  it('đủ thông tin thì vẫn chạy luồng cũ', async () => {
    const { svc, orderCreate, deptCreateMany } = mk(2);
    await svc.create(
      { ...publicDto, originProvince: 'Hà Nội', destinationProvince: 'Lào Cai' } as never,
      user, { fromPublicForm: true },
    );
    expect(orderCreate.mock.calls[0][0].data.status).toBe(OrderStatus.DISTRIBUTED);
    expect(deptCreateMany).toHaveBeenCalled();
  });

  /**
   * Nhân viên nhập tay qua cùng API này KHÔNG được rơi vào awaiting_info: họ đã
   * đi qua form admin vốn bắt buộc đủ trường.
   */
  it('đơn nội bộ (không fromPublicForm) không bao giờ vào awaiting_info', async () => {
    const { svc, orderCreate } = mk(2);
    await svc.create(publicDto as never, user);
    expect(orderCreate.mock.calls[0][0].data.status).toBe(OrderStatus.DISTRIBUTED);
  });
});
