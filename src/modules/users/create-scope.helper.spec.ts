import { ForbiddenException } from '@nestjs/common';
import { Role } from '@/common/enums';
import { MANAGER_GRANTABLE_ROLES, resolveCreateScope } from './create-scope.helper';

/**
 * Trưởng phòng tự tạo được tài khoản cho người của phòng mình, thay vì phải nhờ
 * Admin. Nới quyền kiểu này là nơi leo thang đặc quyền hay nảy ra nhất, nên
 * từng lằn ranh có một test riêng.
 */

const admin = { id: 1, roles: [Role.ADMIN], departmentId: null, canViewCompanyReport: false };
const truongPhong = {
  id: 2, roles: [Role.MANAGER], departmentId: 7, canViewCompanyReport: false,
};

describe('resolveCreateScope — Admin', () => {
  it('tạo được vai trò bất kỳ, ở phòng bất kỳ', () => {
    const got = resolveCreateScope(admin, { roles: [Role.ADMIN], departmentId: 3 });
    expect(got).toEqual({ departmentId: 3, roles: [Role.ADMIN] });
  });

  it('vẫn tạo được tài khoản không thuộc phòng nào', () => {
    expect(resolveCreateScope(admin, { roles: [Role.SALE] }).departmentId).toBeUndefined();
  });
});

describe('resolveCreateScope — Trưởng phòng', () => {
  it('chỉ cấp được Nhân viên, Sale và Điều vận', () => {
    expect(MANAGER_GRANTABLE_ROLES).toEqual([Role.STAFF, Role.SALE, Role.DISPATCHER]);
    expect(resolveCreateScope(truongPhong, { roles: [Role.STAFF] }).roles).toEqual([Role.STAFF]);
    expect(resolveCreateScope(truongPhong, { roles: [Role.SALE] }).roles).toEqual([Role.SALE]);
    expect(resolveCreateScope(truongPhong, { roles: [Role.DISPATCHER] }).roles).toEqual([Role.DISPATCHER]);
  });

  /** Đường leo thang thứ nhất: tự nhân bản quyền của chính mình. */
  it('KHÔNG cấp được Trưởng phòng, Leader hay Admin', () => {
    for (const role of [Role.MANAGER, Role.LEADER, Role.ADMIN])
      expect(() => resolveCreateScope(truongPhong, { roles: [role] })).toThrow(ForbiddenException);
  });

  it('không lách được bằng cách kèm thêm một vai trò hợp lệ', () => {
    expect(() =>
      resolveCreateScope(truongPhong, { roles: [Role.STAFF, Role.MANAGER] }),
    ).toThrow(ForbiddenException);
  });

  /** Đường leo thang thứ hai: cắm người của mình sang phòng khác. */
  it('ép phòng về phòng của chính mình khi bỏ trống', () => {
    expect(resolveCreateScope(truongPhong, { roles: [Role.STAFF] }).departmentId).toBe(7);
  });

  it('từ chối khi chỉ sang phòng khác', () => {
    expect(() =>
      resolveCreateScope(truongPhong, { roles: [Role.STAFF], departmentId: 9 }),
    ).toThrow(ForbiddenException);
  });

  it('chỉ đúng phòng mình thì vẫn cho', () => {
    expect(
      resolveCreateScope(truongPhong, { roles: [Role.STAFF], departmentId: 7 }).departmentId,
    ).toBe(7);
  });

  /**
   * Đường leo thang thứ ba, kín hơn hai cái trên: cờ này mở báo cáo TOÀN CÔNG TY
   * cho tài khoản được tạo, bất kể vai trò của nó hẹp tới đâu.
   */
  it('không bật được cờ xem báo cáo toàn công ty', () => {
    expect(() =>
      resolveCreateScope(truongPhong, { roles: [Role.STAFF], canViewCompanyReport: true }),
    ).toThrow(ForbiddenException);
  });

  /** Trưởng phòng chưa được gán phòng thì không có phạm vi nào để cấp. */
  it('từ chối khi chính trưởng phòng chưa thuộc phòng nào', () => {
    expect(() =>
      resolveCreateScope({ ...truongPhong, departmentId: null }, { roles: [Role.STAFF] }),
    ).toThrow(ForbiddenException);
  });
});

describe('resolveCreateScope — vai trò khác', () => {
  it('Leader và Sale không tạo được tài khoản', () => {
    for (const role of [Role.LEADER, Role.SALE, Role.STAFF])
      expect(() =>
        resolveCreateScope(
          { id: 3, roles: [role], departmentId: 7, canViewCompanyReport: false },
          { roles: [Role.STAFF] },
        ),
      ).toThrow(ForbiddenException);
  });

  /** Kiêm nhiệm: có Admin trong tập vai trò thì đi đường Admin. */
  it('người kiêm cả Admin lẫn Trưởng phòng đi đường Admin', () => {
    const got = resolveCreateScope(
      { id: 4, roles: [Role.MANAGER, Role.ADMIN], departmentId: 7, canViewCompanyReport: false },
      { roles: [Role.LEADER], departmentId: 2 },
    );
    expect(got).toEqual({ departmentId: 2, roles: [Role.LEADER] });
  });
});
