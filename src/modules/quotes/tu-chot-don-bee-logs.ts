import { DeptState, OrderStatus } from '@/common/enums';
import { laKhachBeeLogs } from '../customers/khach-bee-logs.helper';
import { chotDon, PhuThuocChotDon } from '../orders/chot-don';
import { assertTransition } from '../orders/order-state.helper';

/**
 * Đơn Bee Logistics không cần Sale (081): Phòng báo giá gửi giá là đơn CHỐT
 * LUÔN theo giá đó — chọn phòng thắng rồi chốt, như Sale bấm hai nút liền nhau.
 *
 * Nhận ra đơn Bee Logistics qua email hồ sơ khách, KHÔNG qua người tạo: đơn đối
 * tác tạo có `created_by` là đối tác, nhưng Sale bấm "Nhận đơn" là cột đó đổi,
 * còn hồ sơ khách thì không.
 *
 * Trả về true khi đã chốt, để nơi gọi bỏ thông báo "chờ chọn báo giá".
 */
export async function tuChotDonBeeLogs(
  deps: PhuThuocChotDon,
  orderId: number,
  deptId: number,
  actorId: number,
): Promise<boolean> {
  const o = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      code: true, status: true, departmentId: true,
      customer: { select: { email: true } },
      departments: { where: { departmentId: deptId }, select: { department: { select: { isQuoting: true } } } },
    },
  });
  // Chỉ giá của Phòng báo giá mới chốt được (079); đã có phòng thắng thì thôi.
  if (!laKhachBeeLogs(o.customer?.email) || o.departmentId !== null) return false;
  if (!o.departments[0]?.department.isQuoting) return false;

  await deps.prisma.$transaction(async (tx) => {
    if (o.status !== OrderStatus.AWAITING_SELECTION)
      assertTransition(o.status, OrderStatus.AWAITING_SELECTION);
    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.AWAITING_SELECTION, departmentId: deptId, updatedAt: new Date() },
    });
    await tx.orderDepartment.updateMany({
      where: { orderId, state: DeptState.QUOTED }, data: { state: DeptState.LOST },
    });
    await tx.orderDepartment.update({
      where: { orderId_departmentId: { orderId, departmentId: deptId } },
      data: { state: DeptState.WON },
    });
  });
  await chotDon(deps, orderId, 'Đơn Bee Logistics: tự chốt theo giá Phòng báo giá', actorId, o.code, deptId);
  return true;
}
