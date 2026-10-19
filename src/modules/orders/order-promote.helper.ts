import { ActivityService } from '@/common/activity/activity.service';
import { OrderStatus, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotifyService } from '../notifications/notify.service';
import { ServiceDataValidator } from '../services/service-data.validator';
import { hinhDangTuyen } from '@/modules/services/hinh-dang-tuyen.helper';
import { missingOrderInfo } from './order-completeness.helper';
import { sendNewOrderNotification } from './order-notify.helper';
import { assertTransition } from './order-state.helper';

export interface PromoteDeps {
  prisma: PrismaService;
  activity: ActivityService;
  serviceData: ServiceDataValidator;
  notify: NotifyService;
}

/**
 * Đơn đang chờ bổ sung, vừa được sửa: chấm lại và nếu đã đủ thì chạy đúng bước
 * định tuyến mà create() chạy, rồi đi tiếp luồng cũ.
 *
 * Tự động, không có nút bấm: thêm một bước thủ công là thêm một chỗ để quên,
 * và đơn sẽ nằm lại trong hàng chờ dù dữ liệu đã đủ.
 *
 * Thoát sớm khi đơn không ở awaiting_info — đơn đang báo giá dở tuyệt đối
 * không được chạm vào.
 *
 * Nằm ngoài OrdersService (thay vì private method) để giữ orders.service.ts
 * dưới mốc 300 dòng — nhận phụ thuộc qua tham số thay vì `this`.
 */
/**
 * Đơn sinh từ form công khai chưa đứng tên ai (`created_by` NULL), vì lúc đó
 * chưa có người nào tiếp khách. Nhưng MỌI cửa dành cho Sale đều hỏi
 * `createdBy === user.id`: phạm vi đọc ở ScopeService, ownedOrder() của
 * selectQuote, và close(). Để nguyên thì Sale vừa nhập nốt thông tin và bấm Lưu
 * sẽ MẤT quyền đọc chính đơn mình vừa làm — API trả 404 dù dữ liệu đã ghi xong —
 * và sau đó không Sale nào chọn được báo giá thắng cho đơn đó nữa.
 *
 * Nên ai hoàn thiện thông tin thì đơn về tay người đó, đúng nguyên tắc
 * resolveOrderActor đã đặt ra cho lúc tạo: "đơn về tay người đã tiếp khách".
 *
 * Hai ràng buộc, đều cố ý:
 * - CHỈ Sale. Admin đã đọc được mọi đơn, đổi người đứng tên của họ chỉ làm sai sổ.
 * - CHỈ khi đơn chưa đứng tên ai. Đơn đã có sale thật phụ trách
 *   thì không ai giành được, kể cả khi họ là người bấm Lưu.
 *
 * Việc khách tự tạo đơn vẫn nằm nguyên trong activity log — đây là đổi
 * người phụ trách, không phải xoá dấu vết.
 */
function claimBySale(
  order: { createdBy: number | null },
  user: AuthenticatedUser,
): { createdBy?: number } {
  if (!user.roles.includes(Role.SALE)) return {};
  if (order.createdBy !== null) return {};
  return { createdBy: user.id };
}

export async function promoteIfComplete(
  deps: PromoteDeps, orderId: number, user: AuthenticatedUser,
): Promise<void> {
  const order = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true, serviceId: true, serviceChildId: true,
      originProvince: true, destinationProvince: true,
      serviceData: true,
      customer: { select: { companyName: true, contactName: true, phone: true } },
      service: {
        select: {
          name: true, hasDomesticOrigin: true, hasDomesticDestination: true,
          // Đếm kèm, không phải một truy vấn riêng — xem ORDER_DETAIL_INCLUDE.
          _count: { select: { children: { where: { isActive: true } } } },
        },
      },
      serviceChild: {
        select: { hasDomesticOrigin: true, hasDomesticDestination: true },
      },
      createdBy: true,
    },
  });
  if (order.status !== OrderStatus.AWAITING_INFO) return;

  const missing = missingOrderInfo({
    // Cùng một luật với lúc tạo đơn: thiếu dịch vụ con là đơn chưa mang mã TMS.
    serviceChildId: order.serviceChildId,
    coDichVuCon: (order.service._count?.children ?? 0) > 0,
    // Tên công ty HOẶC tên người liên hệ. Chấm ở create() đọc từ DTO, chấm lại
    // ở đây đọc từ hồ sơ đã lưu — hai lần chấm phải cùng một luật, lệch nhau là
    // đơn kẹt vĩnh viễn ở awaiting_info mà không một dòng log nào giải thích.
    customerName: order.customer?.companyName ?? order.customer?.contactName ?? null,
    phone: order.customer?.phone ?? null,
    serviceId: order.serviceId,
    originProvince: order.originProvince,
    destinationProvince: order.destinationProvince,
    serviceData: (order.serviceData ?? {}) as Record<string, unknown>,
    requiredFields: await deps.serviceData.requiredFieldsOf(order.serviceId),
    // Đọc theo dịch vụ con nếu đơn đã chọn — cùng một luật với lúc tạo đơn.
    hasDomesticOrigin: hinhDangTuyen(order.service, order.serviceChild).diTrongNuoc,
    hasDomesticDestination: hinhDangTuyen(order.service, order.serviceChild).denTrongNuoc,
  });
  if (missing.length) return;

  const deptIds = await deps.prisma.$transaction(async (tx) => {
    const depts = await tx.department.findMany({
      // Chỉ Phòng báo giá được chia đơn (080) — cùng luật với lúc tạo đơn.
      where: { isActive: true, isQuoting: true, serviceIds: { has: order.serviceId } },
      select: { id: true },
    });
    const next = depts.length ? OrderStatus.DISTRIBUTED : OrderStatus.NEW;
    assertTransition(order.status, next);
    await tx.order.update({
      where: { id: orderId },
      data: { status: next, updatedAt: new Date(), ...claimBySale(order, user) },
    });
    if (depts.length)
      await tx.orderDepartment.createMany({
        data: depts.map((d) => ({ orderId, departmentId: d.id })),
        // Đơn chờ bổ sung lẽ ra chưa có dòng nào, nhưng bảng có UNIQUE
        // (order_id, department_id) — đừng để một dòng sót làm hỏng cả lần thăng.
        skipDuplicates: true,
      });
    await deps.activity.log(tx, {
      orderId, entity: 'orders', entityId: orderId, action: 'complete-info',
      actorId: user.id, detail: { status: [order.status, next] },
    });
    return depts.map((d) => d.id);
  });

  await sendNewOrderNotification(deps, orderId, deptIds, order.service.name, []);
}
