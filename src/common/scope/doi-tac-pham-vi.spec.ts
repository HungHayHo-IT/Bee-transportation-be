import { Role } from '../enums';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { canReadAllOrders } from './can-read-all-orders';
import { isCompanyWide } from './is-company-wide';
import { canSeeOrderAmount } from './money.visibility';
import { ScopeService } from './scope.service';

const doiTac = (them: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 50,
  email: 'an@beelogistics.com',
  fullName: 'An',
  roles: [Role.PARTNER],
  departmentId: null,
  canViewCompanyReport: false,
  ...them,
} as AuthenticatedUser);

describe('phạm vi dữ liệu của vai trò đối tác', () => {
  const scope = new ScopeService();

  it('chỉ thấy đơn mà hồ sơ khách mang email Bee Logistics', () => {
    const w = scope.orderWhere(doiTac()) as { customer: { OR: unknown[] } };
    expect(w.customer.OR).toHaveLength(2);
    // Không được là {} (thấy tất cả) cũng không được là {id:-1} (rỗng).
    expect(Object.keys(w)).toEqual(['customer']);
  });

  /**
   * Cái bẫy thật: ai đó gán phòng ban cho tài khoản đối tác trên màn nhân sự.
   * Nếu nhánh đối tác không trả về NGAY, vế phòng ban bên dưới sẽ hợp vào và
   * người ngoài công ty thấy toàn bộ đơn của phòng đó.
   */
  it('gán phòng ban cho đối tác KHÔNG mở rộng phạm vi của họ', () => {
    const w = scope.orderWhere(doiTac({ departmentId: 3 })) as Record<string, unknown>;
    expect(Object.keys(w)).toEqual(['customer']);
    expect(w.OR).toBeUndefined();
  });

  it('kiêm thêm vai trò nội bộ cũng không nới được phạm vi', () => {
    const w = scope.orderWhere(
      doiTac({ roles: [Role.PARTNER, Role.SALE], departmentId: 3 }),
    ) as Record<string, unknown>;
    expect(Object.keys(w)).toEqual(['customer']);
  });

  it('KHÔNG nằm trong hai danh sách cho phép rộng nhất', () => {
    expect(canReadAllOrders(doiTac())).toBe(false);
    expect(isCompanyWide(doiTac())).toBe(false);
  });

  it('thấy giá đã chốt — đó là số tiền họ trả', () => {
    expect(canSeeOrderAmount(doiTac(), { createdBy: 1, departmentId: 2 })).toBe(true);
  });
});
