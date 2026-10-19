import { Role } from '@/common/enums';
import { canMention, MentionCandidate, resolveThreadDepartment } from './mentionable.helper';

const order = { createdBy: 99 };

const mk = (over: Partial<MentionCandidate> = {}): MentionCandidate => ({
  id: 1,
  roles: [Role.STAFF],
  departmentId: 3,
  ...over,
});

/** Phòng 3 và phòng 4 tham gia đơn; phòng 8 thì không. */
const PARTICIPATING = new Set([3, 4]);

const ctx = (threadDepartmentId: number | null) => ({
  orderCreatedBy: order.createdBy,
  threadDepartmentId,
  participatingDeptIds: PARTICIPATING,
});

describe('canMention', () => {
  it('sale tạo đơn luôn nhắc được, kể cả ở luồng riêng của phòng', () => {
    expect(canMention(mk({ id: 99, roles: [Role.SALE], departmentId: null }), ctx(3))).toBe(true);
  });

  it('Admin nhắc được ở mọi luồng', () => {
    expect(canMention(mk({ id: 5, roles: [Role.ADMIN], departmentId: null }), ctx(3))).toBe(true);
  });

  /** Siết cùng canReadAllOrders: lãnh đạo không đọc được đơn ngoài phòng mình nữa. */
  it('Ban lãnh đạo KHÔNG mặc nhiên nhắc được', () => {
    expect(canMention(mk({ id: 6, roles: [Role.LEADER], departmentId: null }), ctx(3))).toBe(false);
  });

  it('người của phòng tham gia: nhắc được ở luồng chung', () => {
    expect(canMention(mk({ departmentId: 4 }), ctx(null))).toBe(true);
  });

  it('người của phòng KHÁC KHÔNG nhắc được ở luồng riêng — để lộ luồng là lộ báo giá', () => {
    expect(canMention(mk({ departmentId: 4 }), ctx(3))).toBe(false);
  });

  it('người của phòng đúng luồng thì nhắc được', () => {
    expect(canMention(mk({ departmentId: 3 }), ctx(3))).toBe(true);
  });

  it('phòng KHÔNG tham gia đơn thì không nhắc được ở bất kỳ luồng nào', () => {
    expect(canMention(mk({ departmentId: 8 }), ctx(null))).toBe(false);
    expect(canMention(mk({ departmentId: 8 }), ctx(3))).toBe(false);
  });

  it('người không thuộc phòng nào và không phải sale phụ trách thì không nhắc được', () => {
    expect(canMention(mk({ departmentId: null }), ctx(null))).toBe(false);
  });
});

describe('resolveThreadDepartment', () => {
  const staff = { id: 1, roles: [Role.STAFF], departmentId: 3 };
  const sale = { id: 99, roles: [Role.SALE], departmentId: null };

  it('người viết tự do (sale phụ trách / admin) mặc định vào luồng chung', () => {
    expect(resolveThreadDepartment(sale, order, undefined)).toBeNull();
  });

  it('người của phòng mặc định vào luồng phòng mình', () => {
    expect(resolveThreadDepartment(staff, order, undefined)).toBe(3);
  });

  it('chỉ định luồng nào thì theo luồng đó', () => {
    expect(resolveThreadDepartment(sale, order, 4)).toBe(4);
  });
});
