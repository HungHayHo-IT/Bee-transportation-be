import { ForbiddenException } from '@nestjs/common';
import { Role } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { chanTaiPhienKhac, phienDuocDoc } from './phien-cho-doi-tac.helper';

const nguoi = (roles: string[]): AuthenticatedUser =>
  ({ id: 1, email: 'a@b.c', fullName: 'A', roles, departmentId: null,
    canViewCompanyReport: false } as AuthenticatedUser);

const doiTac = nguoi([Role.PARTNER]);
const sale = nguoi([Role.SALE]);

describe('phienDuocDoc', () => {
  it('đối tác xin phiên nháp thì bị bỏ qua, nhận phiên đang áp dụng', () => {
    expect(phienDuocDoc(doiTac, 7)).toBeUndefined();
  });

  it('đối tác không xin phiên nào cũng ra phiên đang áp dụng', () => {
    expect(phienDuocDoc(doiTac, undefined)).toBeUndefined();
  });

  it('nhân viên xin phiên nào thì được phiên đó', () => {
    expect(phienDuocDoc(sale, 7)).toBe(7);
    expect(phienDuocDoc(sale, undefined)).toBeUndefined();
  });

  it('kiêm thêm vai trò nội bộ cũng không nới được', () => {
    expect(phienDuocDoc(nguoi([Role.PARTNER, Role.SALE]), 7)).toBeUndefined();
  });
});

describe('chanTaiPhienKhac', () => {
  it('đối tác tải đúng phiên đang áp dụng thì qua', () => {
    expect(() => chanTaiPhienKhac(doiTac, 3, 3)).not.toThrow();
  });

  it('đối tác tải phiên khác thì bị chặn', () => {
    expect(() => chanTaiPhienKhac(doiTac, 7, 3)).toThrow(ForbiddenException);
  });

  it('chưa công bố phiên nào thì đối tác không tải được gì', () => {
    expect(() => chanTaiPhienKhac(doiTac, 7, null)).toThrow(ForbiddenException);
  });

  it('nhân viên tải phiên nào cũng được, kể cả khi chưa có phiên áp dụng', () => {
    expect(() => chanTaiPhienKhac(sale, 7, 3)).not.toThrow();
    expect(() => chanTaiPhienKhac(sale, 7, null)).not.toThrow();
  });
});
