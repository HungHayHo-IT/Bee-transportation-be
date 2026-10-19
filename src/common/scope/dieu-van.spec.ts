import { OrderStatus, Role } from '../enums';
import { AuthenticatedUser } from '../types/authenticated-user.type';
import { dieuVanWhere, laDieuVanCuaDon, xemDonDaChot } from './dieu-van';

const nguoi = (serviceIds: number[]): AuthenticatedUser => ({
  id: 9, email: 'dv@x', fullName: 'DV', roles: [Role.DISPATCHER], departmentId: 15,
  canViewCompanyReport: false, mustChangePassword: false,
  dieuVan: { departmentId: 15, serviceIds },
});
const PHONG = { isSales: false, isQuoting: false };

describe('Điều vận / Trưởng phòng xem đơn đã chốt của dịch vụ phòng mình tích', () => {
  it('chỉ đơn ĐÃ CHỐT của các dịch vụ đã tích', () => {
    expect(dieuVanWhere(nguoi([1, 3]))).toEqual({
      status: OrderStatus.CLOSED, serviceId: { in: [1, 3] },
    });
  });

  it('phòng chưa tích dịch vụ nào thì không có vế nào', () => {
    expect(dieuVanWhere(nguoi([]))).toBeNull();
  });

  it('Điều vận và Trưởng phòng được; Nhân viên báo giá, Sale thì không', () => {
    expect(xemDonDaChot([Role.DISPATCHER], PHONG)).toBe(true);
    expect(xemDonDaChot([Role.MANAGER], PHONG)).toBe(true);
    expect(xemDonDaChot([Role.STAFF], PHONG)).toBe(false);
    expect(xemDonDaChot([Role.SALE], PHONG)).toBe(false);
  });

  it('Phòng Sale và Phòng báo giá không hưởng vế này', () => {
    expect(xemDonDaChot([Role.MANAGER], { isSales: true, isQuoting: false })).toBe(false);
    expect(xemDonDaChot([Role.MANAGER], { isSales: false, isQuoting: true })).toBe(false);
  });

  it('xem giá: chỉ đơn đã chốt thuộc dịch vụ đã tích', () => {
    const u = nguoi([3]);
    expect(laDieuVanCuaDon(u, { serviceId: 3, status: OrderStatus.CLOSED })).toBe(true);
    expect(laDieuVanCuaDon(u, { serviceId: 3, status: OrderStatus.AWAITING_SELECTION })).toBe(false);
    expect(laDieuVanCuaDon(u, { serviceId: 4, status: OrderStatus.CLOSED })).toBe(false);
  });
});
