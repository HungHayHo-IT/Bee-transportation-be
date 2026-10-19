import { Role } from '@/common/enums';
import type { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { visibleDepartments } from './orders.mapper';

/**
 * Báo giá kín: mỗi phòng chỉ thấy báo giá của chính mình.
 *
 * Cờ "Xem toàn bộ đơn (chỉ xem)" mở DANH SÁCH và CHI TIẾT đơn, KHÔNG mở báo
 * giá. Người giữ cờ là Pricing — thuộc phòng VC nội địa, chính họ cũng báo
 * giá cạnh tranh trên nhiều đơn. Thấy giá phòng khác trước khi gửi là mất ý
 * nghĩa so sánh (chốt 12/10/2026; #152 từng mở rồi bị revert).
 */
const dong = (departmentId: number, amount: number) => ({
  departmentId,
  department: { name: `Phong ${departmentId}` },
  state: 'quoted',
  assignee: null,
  passReason: null,
  amount,
  scopeNote: null,
  leadTime: null,
  validUntil: null,
  quoteVersion: 1,
  distributedAt: new Date(),
  claimedAt: null,
  lastQuotedAt: null,
});
const DON = { createdBy: 1, departments: [dong(4, 800), dong(5, 900), dong(14, 700)] } as never;

const pricing = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  id: 20, email: 'p@bee.vn', fullName: 'Pricing', roles: [Role.STAFF], departmentId: 4,
  canViewCompanyReport: false, canViewAllOrders: true, mustChangePassword: false, ...over,
});

describe('visibleDepartments — bao gia kin', () => {
  it('co "xem toan bo don" van CHI thay bao gia cua phong minh', () => {
    expect(visibleDepartments(DON, pricing()).map((d) => d.departmentId)).toEqual([4]);
  });

  it('don khong co phong minh thi khong thay bao gia nao', () => {
    expect(visibleDepartments(DON, pricing({ departmentId: 6 }))).toEqual([]);
  });

  it('Sale tao don thi thay het de so sanh', () => {
    expect(visibleDepartments(DON, pricing({ id: 1, roles: [Role.SALE] })).length).toBe(3);
  });
});
