import { OrderStatus } from '@/common/enums';
import { OrdersService } from './orders.service';

/**
 * Đơn kẹt VĨNH VIỄN trong awaiting_info mà không có lấy một dòng log.
 *
 * `create()` chấm đủ-thiếu trên DTO gửi lên, còn `promoteIfComplete()` chấm lại
 * trên hồ sơ khách đã lưu. Khách trùng tên thì `create()` dùng lại hồ sơ cũ mà
 * KHÔNG ghi số điện thoại vừa gửi vào đó, nên hai lần chấm nhìn hai dữ liệu
 * khác nhau: lần đầu thấy có số (đơn chỉ còn thiếu hai đầu điểm), lần sau đọc
 * `customers.phone = null` nên không đồng ý thăng và lặng lẽ thoát. Nhân viên
 * nhập đủ điểm đi/điểm đến, bấm Lưu, và đơn nằm lại trong hàng chờ mãi mãi.
 */
function mk(existingPhone: string | null) {
  const customerRow = { id: 5, companyName: 'Công ty A', phone: existingPhone };
  const customerUpdate = jest.fn(
    ({ data }: { data: { phone?: string } }) => Object.assign(customerRow, data),
  );

  // MỘT hàng đơn dùng chung cho cả create lẫn update: promoteIfComplete phải đọc
  // đúng thứ create ghi, nếu mỗi bên một bản mock thì test không chứng minh được
  // hai lần chấm có khớp nhau hay không.
  const orderRow = {
    id: 77, code: 'RNT-260918-01', source: 'website', status: OrderStatus.NEW,
    serviceId: 3, originProvince: null, destinationProvince: null, serviceData: {},
    customer: customerRow, service: { name: 'Thuê xe' },
  };

  const tx = {
    $queryRaw: jest.fn()
      .mockResolvedValueOnce([{ today: new Date('2026-09-18') }])
      .mockResolvedValueOnce([{ no: 1 }])
      .mockResolvedValueOnce([{ code: 'RNT-260918-01' }]),
    customer: { create: jest.fn(), update: customerUpdate },
    department: { findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) },
    order: {
      create: jest.fn((args: { data: { status: OrderStatus } }) => {
        orderRow.status = args.data.status;
        return { id: 77 };
      }),
      update: jest.fn((args: { data: Record<string, unknown> }) => Object.assign(orderRow, args.data)),
    },
    orderDepartment: { createMany: jest.fn() },
  };
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue({ id: 3, name: 'Thuê xe', isActive: true, cargoFields: [] }) },
    // create()/update() nay tra dich vu con dang bat de biet don co phai
    // chon them khong — xem dich-vu-con.helper. Thieu cua nay thi test do
    // vi thieu do gia chu khong vi ma sai.
    serviceChild: { findMany: jest.fn().mockResolvedValue([]) },
    order: { findUniqueOrThrow: jest.fn().mockResolvedValue(orderRow) },
    // update() huỷ mọi yêu cầu ký đang chờ của đơn — xem huy-cho-ky.ts.
    orderSignature: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const serviceData = {
    assertCargoAllowed: jest.fn(),
    cargoFieldsOf: jest.fn().mockResolvedValue([]),
    validate: jest.fn().mockResolvedValue({}),
    requiredFieldsOf: jest.fn().mockResolvedValue([]),
  };
  // Thứ tự tham số PHẢI khớp constructor thật (orders.service.ts):
  // prisma, activity, notify, query, customers, diaChiKhach, serviceData,
  // customerNotify.
  const svc = new OrdersService(
    prisma as never,
    { log: jest.fn() } as never,
    { push: jest.fn(), adminsAndSales: jest.fn().mockResolvedValue([1]), deptRecipients: jest.fn().mockResolvedValue([9]) } as never,
    { detail: jest.fn().mockResolvedValue({ id: 77 }), findScoped: jest.fn().mockResolvedValue(orderRow) } as never,
    { findByName: jest.fn().mockResolvedValue(customerRow) } as never,
    // DiaChiKhachService — ghi nho dia chi khach, viec PHU cua tao don.
    { ghiNho: jest.fn().mockResolvedValue(null), maTheoDiaChi: jest.fn() } as never,
    serviceData as never,
    { quoteRequestReceived: jest.fn() } as never,
  );
  return { svc, customerRow, orderRow, customerUpdate };
}

const publicDto = {
  serviceId: 3,
  newCustomer: { companyName: 'Công ty A', phone: '0900000000' },
  source: 'website',
};
// AuthenticatedUser luôn có roles — thiếu nó là fixture sai, không phải code
// thiếu phòng thủ (ScopeService cũng đọc thẳng user.roles).
const user = { id: 1, roles: ['admin'] } as never;

describe('đơn form công khai trùng tên khách cũ', () => {
  it('khách cũ chưa có số điện thoại: nhập đủ hai đầu điểm thì đơn THĂNG, không kẹt lại', async () => {
    const { svc, orderRow } = mk(null);

    await svc.create(publicDto as never, user, { fromPublicForm: true });
    expect(orderRow.status).toBe(OrderStatus.AWAITING_INFO);

    await svc.update(
      77, { originProvince: 'Hà Nội', destinationProvince: 'Lào Cai' } as never, user,
    );
    expect(orderRow.status).toBe(OrderStatus.DISTRIBUTED);
  });

  /**
   * Người gửi form là KHÁCH VÃNG LAI ẩn danh. Cho form công khai ghi đè số điện
   * thoại đã có nghĩa là ai cũng đổi được số liên hệ của một công ty có thật chỉ
   * bằng cách gõ đúng tên họ — chỉ được lấp chỗ trống, không được đè.
   */
  it('khách cũ đã có số điện thoại thì KHÔNG bị form công khai ghi đè', async () => {
    const { svc, customerRow, customerUpdate } = mk('0911111111');
    await svc.create(publicDto as never, user, { fromPublicForm: true });
    expect(customerRow.phone).toBe('0911111111');
    expect(customerUpdate).not.toHaveBeenCalled();
  });
});
