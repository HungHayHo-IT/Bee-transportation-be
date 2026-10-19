import { AuthenticatedUser, OrderMoneyRow } from '../types/authenticated-user.type';
import { canReadAllOrders } from './can-read-all-orders';
import { laDoiTac } from './la-doi-tac';
import { laDieuVanCuaDon } from './dieu-van';

/**
 * orders.finalAmount CHÍNH LÀ báo giá của phòng thắng, nên luật hiển thị nó phải chặt
 * bằng luật báo giá kín: phòng tham gia rồi THUA không được thấy.
 */
export function canSeeOrderAmount(user: AuthenticatedUser, order: OrderMoneyRow): boolean {
  if (canReadAllOrders(user)) return true;

  /* Đối tác thấy giá đã chốt: đó là số TIỀN HỌ TRẢ, không phải số nội bộ.
     An toàn vì ScopeService.orderWhere đã chặn đối tác ở đúng đơn của công ty
     họ trước khi tới đây — hàm này lọc CỘT, phạm vi lọc DÒNG. Ai bỏ vế đối
     tác trong orderWhere thì phải bỏ luôn vế này. */
  if (laDoiTac(user)) return true;
  if (order.createdBy === user.id) return true;
  if (user.departmentId !== null && order.departmentId === user.departmentId) return true;
  // Điều vận / Trưởng phòng xem được giá của đơn đã chốt thuộc dịch vụ phòng mình (080).
  if (laDieuVanCuaDon(user, order)) return true;
  return false;
}

/** Trả về số tiền hoặc null tùy quyền. Dùng cho cả JSON lẫn Excel/PDF. */
export function maskAmount(
  user: AuthenticatedUser,
  order: OrderMoneyRow,
  amount: unknown,
): number | null {
  if (amount === null || amount === undefined) return null;
  if (!canSeeOrderAmount(user, order)) return null;
  return Number(amount);
}
