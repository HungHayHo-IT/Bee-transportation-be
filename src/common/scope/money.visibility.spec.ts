import { Role } from '../enums';
import { AuthenticatedUser, OrderMoneyRow } from '../types/authenticated-user.type';
import { canSeeOrderAmount, maskAmount } from './money.visibility';

const mkUser = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 7,
  email: 'x@bee.vn',
  fullName: 'X',
  roles: [],
  departmentId: null,
  canViewCompanyReport: false,
  mustChangePassword: false,
  ...over,
});

const order: OrderMoneyRow = { createdBy: 99, departmentId: 5 };

describe('canSeeOrderAmount', () => {
  it('Admin thấy', () => {
    expect(canSeeOrderAmount(mkUser({ roles: [Role.ADMIN] }), order)).toBe(true);
  });

  /** Siết theo canReadAllOrders: quyền xem báo cáo tổng không kéo theo số tiền từng đơn. */
  it('Ban lãnh đạo KHÔNG thấy số tiền của đơn ngoài phòng mình', () => {
    expect(canSeeOrderAmount(mkUser({ roles: [Role.LEADER] }), order)).toBe(false);
  });

  it('cờ can_view_company_report KHÔNG mở số tiền của đơn', () => {
    expect(canSeeOrderAmount(mkUser({ roles: [Role.STAFF], canViewCompanyReport: true }), order))
      .toBe(false);
  });

  it('sale tạo đơn thì thấy', () => {
    expect(canSeeOrderAmount(mkUser({ id: 99, roles: [Role.SALE] }), order)).toBe(true);
  });

  it('sale KHÁC không thấy', () => {
    expect(canSeeOrderAmount(mkUser({ roles: [Role.SALE] }), order)).toBe(false);
  });

  it('phòng THẮNG thấy', () => {
    expect(canSeeOrderAmount(mkUser({ roles: [Role.STAFF], departmentId: 5 }), order)).toBe(true);
  });

  it('phòng THUA KHÔNG thấy — finalAmount chính là giá phòng thắng', () => {
    expect(canSeeOrderAmount(mkUser({ roles: [Role.STAFF], departmentId: 6 }), order)).toBe(false);
  });

  it('đơn chưa chốt (departmentId null) thì phòng nào cũng không thấy', () => {
    const open: OrderMoneyRow = { createdBy: 99, departmentId: null };
    expect(canSeeOrderAmount(mkUser({ roles: [Role.STAFF], departmentId: 5 }), open)).toBe(false);
  });
});

describe('maskAmount', () => {
  it('trả null khi không có quyền', () => {
    expect(maskAmount(mkUser({ roles: [Role.SALE] }), order, 42000000)).toBeNull();
  });

  it('trả số khi có quyền', () => {
    expect(maskAmount(mkUser({ roles: [Role.ADMIN] }), order, '42000000')).toBe(42000000);
  });

  it('amount null vẫn là null', () => {
    expect(maskAmount(mkUser({ roles: [Role.ADMIN] }), order, null)).toBeNull();
  });
});
