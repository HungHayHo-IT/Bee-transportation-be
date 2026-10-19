import { ForbiddenException } from '@nestjs/common';
import { Role } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { assertTaoDuoc, chonDuocKhiTaoDon } from './approval.helper';

const ai = (roles: Role[], departmentId: number | null = 1): AuthenticatedUser =>
  ({ id: 9, roles, departmentId } as AuthenticatedUser);

/* Buoc duyet ho so khach hang da bo o migration 052: tao la dung duoc ngay.
   Nhung phep thu cua trangThaiKhiTao, assertCoTheDuyet, assertChuyenTrangThai
   va loGhiChu di cung cac ham do. */
describe('ai tạo được hồ sơ khách hàng', () => {
  // Chan o backend chu khong chi an nut: an nut thi mot lan goi API thang van
  // tao duoc.
  it('vai CHỈ XEM thì không tạo được', () => {
    expect(() => assertTaoDuoc(ai([Role.LEADER]))).toThrow(ForbiddenException);
  });

  it('bốn vai còn lại tạo được', () => {
    for (const r of [Role.ADMIN, Role.MANAGER, Role.SALE, Role.STAFF])
      expect(() => assertTaoDuoc(ai([r]))).not.toThrow();
  });

  // Mot nguoi mang hai vai thi vai lam duoc viec quyet dinh, khong phai vai
  // chat nhat - nguoc lai thi gan them mot vai lai lam ho MAT quyen.
  it('kiêm thêm một vai khác vai chỉ xem thì vẫn tạo được', () => {
    expect(() => assertTaoDuoc(ai([Role.LEADER, Role.SALE]))).not.toThrow();
  });
});

describe('chọn khách khi tạo đơn', () => {
  it('chỉ hồ sơ đã duyệt mới chọn được', () => {
    expect(chonDuocKhiTaoDon('approved')).toBe(true);
    expect(chonDuocKhiTaoDon('pending')).toBe(false);
    expect(chonDuocKhiTaoDon('rejected')).toBe(false);
  });
});
