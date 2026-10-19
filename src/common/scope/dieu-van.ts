import { Prisma } from '@prisma/client';
import { OrderStatus, Role } from '../enums';
import { AuthenticatedUser } from '../types/authenticated-user.type';

/**
 * Điều vận và Trưởng phòng của một phòng (080) XEM được đơn ĐÃ CHỐT thuộc các
 * dịch vụ phòng mình tích trên ma trận định tuyến.
 *
 * Phòng Sale và Phòng báo giá không hưởng vế này: Sale xem đơn mình đứng tên,
 * Phòng báo giá xem đơn được chia cho mình — đó là phạm vi riêng của họ.
 * Dịch vụ tích ở phòng khác KHÔNG chia đơn (chỉ Phòng báo giá được chia).
 */
export function xemDonDaChot(
  roles: readonly string[],
  dept: { isSales: boolean; isQuoting: boolean } | null,
): boolean {
  if (!dept || dept.isSales || dept.isQuoting) return false;
  return roles.includes(Role.DISPATCHER) || roles.includes(Role.MANAGER);
}

/** CHỈ dùng cho đường ĐỌC (orderReadWhere): không báo giá, không sửa. */
export function dieuVanWhere(user: AuthenticatedUser): Prisma.OrderWhereInput | null {
  const dv = user.dieuVan;
  if (!dv || dv.serviceIds.length === 0) return null;
  return { status: OrderStatus.CLOSED, serviceId: { in: [...dv.serviceIds] } };
}

/** Đơn đã chốt thuộc dịch vụ phòng người này tích — để mở xem giá. */
export function laDieuVanCuaDon(
  user: AuthenticatedUser,
  don: { serviceId?: number; status?: string },
): boolean {
  const dv = user.dieuVan;
  if (!dv || don.status !== OrderStatus.CLOSED || don.serviceId === undefined) return false;
  return dv.serviceIds.includes(don.serviceId);
}
