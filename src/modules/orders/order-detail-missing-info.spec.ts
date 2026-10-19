import { OrderStatus } from '@/common/enums';
import { OrdersQueryService } from './orders-query.service';

/**
 * Admin từng tự tính lại danh sách "còn thiếu gì" ở banner, và bản tính đó lệch
 * với backend ba chỗ: bỏ qua tên khách và số điện thoại, bỏ qua trường có
 * fieldType 'boolean', và chỉ coi `null` là trống nên chuỗi rỗng lọt lưới. Đơn
 * chỉ thiếu mỗi số điện thoại hiện ra banner với danh sách RỖNG — bảo nhân viên
 * đi nhập thêm nhưng không nói nhập gì.
 *
 * Chữa bằng cách xoá hẳn định nghĩa thứ hai: backend phơi `missingInfo` tính từ
 * `missingOrderInfo()`, admin chỉ việc in ra.
 */
function mk(status: OrderStatus, phone: string | null) {
  const row = {
    id: 77, code: 'RNT-260918-01', status, serviceId: 3,
    service: { code: 'RNT', name: 'Thuê xe' },
    customer: { companyName: 'Công ty A', phone },
    creator: { fullName: 'Sale A', email: 'sale.a@bee.vn', roles: ['sale'] },
    department: null, departmentId: null, createdBy: 1,
    originProvince: 'Hà Nội', destinationProvince: 'Lào Cai',
    originAddress: null, destinationAddress: null, desiredDate: null,
    weightKg: null, volumeCbm: null, packageCount: null, containerType: null,
    dimLM: null, dimWM: null, dimHM: null, goodsName: null, note: null, source: 'website',
    rejectReason: null, closeNote: null, rejectNote: null, cancelReason: null,
    completedAt: null, closedAt: null, finalAmount: null,
    createdAt: new Date(), updatedAt: new Date(), orderDay: new Date(), dailyNo: 1,
    customerId: 5, serviceData: {}, milestones: [], departments: [],
  };
  const requiredFieldsOf = jest.fn().mockResolvedValue([]);
  const svc = new OrdersQueryService(
    { order: { findFirst: jest.fn().mockResolvedValue(row) } } as never,
    { orderWhere: jest.fn().mockReturnValue({}), orderReadWhere: jest.fn().mockReturnValue({}) } as never,
    { requiredFieldsOf } as never,
  );
  return { svc, requiredFieldsOf };
}

const user = { id: 1, roles: ['admin'], departmentId: null } as never;

describe('OrderDetailDto.missingInfo — một định nghĩa duy nhất cho "còn thiếu gì"', () => {
  it('đơn chờ bổ sung thiếu số điện thoại thì nêu đúng "Số điện thoại"', async () => {
    const { svc } = mk(OrderStatus.AWAITING_INFO, null);
    expect((await svc.detail(77, user)).missingInfo).toEqual(['Số điện thoại']);
  });

  it('đơn chờ bổ sung đã đủ thì trả mảng rỗng', async () => {
    const { svc } = mk(OrderStatus.AWAITING_INFO, '0900000000');
    expect((await svc.detail(77, user)).missingInfo).toEqual([]);
  });

  /** Luồng bình thường không được gánh thêm truy vấn chỉ để tính một mảng rỗng. */
  it('đơn không ở awaiting_info thì rỗng và KHÔNG tra bộ trường bắt buộc', async () => {
    const { svc, requiredFieldsOf } = mk(OrderStatus.QUOTING, null);
    expect((await svc.detail(77, user)).missingInfo).toEqual([]);
    expect(requiredFieldsOf).not.toHaveBeenCalled();
  });
});
