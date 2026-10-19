import { Role } from '@/common/enums';
import type { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { khachCuaDoiTac } from './order-customer.helper';
import { visibleDepartments } from './orders.mapper';

/**
 * Đơn Bee Logistics (081): đối tác tự tạo yêu cầu, thấy thẳng giá phòng ban,
 * và hồ sơ khách luôn mang email của chính tài khoản đối tác.
 */
const doiTac: AuthenticatedUser = {
  id: 50, email: 'an@beelogistics.com', fullName: 'An', roles: [Role.PARTNER], departmentId: null,
  canViewCompanyReport: false, canViewAllOrders: false, mustChangePassword: false,
};

const dong = (departmentId: number, amount: number | null) => ({
  departmentId,
  department: { name: `Phong ${departmentId}` },
  state: amount === null ? 'passed' : 'quoted',
  assignee: { fullName: 'Pricing A' },
  assigneeId: 20,
  passReason: amount === null ? 'khong lam tuyen nay' : null,
  amount,
  scopeNote: null,
  leadTime: null,
  validUntil: null,
  quoteVersion: 1,
  distributedAt: new Date(),
  claimedAt: null,
  lastQuotedAt: null,
});

describe('đơn Bee Logistics — đối tác', () => {
  it('thấy giá các phòng đã báo, không thấy phòng chưa có giá', () => {
    const don = { createdBy: 1, departments: [dong(4, 800), dong(5, null)] } as never;
    const kq = visibleDepartments(don, doiTac);
    expect(kq.map((d) => [d.departmentId, d.amount])).toEqual([[4, 800]]);
  });

  it('không lộ người xử lý và lý do bỏ qua', () => {
    const don = { createdBy: 1, departments: [dong(4, 800)] } as never;
    const [d] = visibleDepartments(don, doiTac);
    expect([d.assigneeName, d.assigneeId, d.passReason]).toEqual([null, null, null]);
  });

  it('dùng lại hồ sơ khách mang đúng email, bỏ qua tên công ty gửi lên', async () => {
    const tx = {
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 7 }), create: jest.fn() },
    };
    expect(await khachCuaDoiTac(tx as never, doiTac.email, { companyName: 'Cty Khac' })).toBe(7);
    expect(tx.customer.create).not.toHaveBeenCalled();
  });

  it('chưa có hồ sơ thì tạo mới với email của tài khoản', async () => {
    const tx = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 9 }),
      },
    };
    expect(await khachCuaDoiTac(tx as never, doiTac.email, { companyName: ' Bee Logs ' })).toBe(9);
    expect(tx.customer.create.mock.calls[0][0].data).toMatchObject({
      email: 'an@beelogistics.com', companyName: 'Bee Logs', status: 'approved',
    });
  });
});
