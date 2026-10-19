import { PrismaService } from '@/common/prisma/prisma.service';
import { NotifyService } from '../notifications/notify.service';
import { buildNewOrderRows } from './new-order-notify.helper';

export interface SendNewOrderNotificationDeps {
  prisma: PrismaService;
  notify: NotifyService;
}

/**
 * Ai cần biết một đơn vừa ra đời hoặc vừa tự thăng khỏi awaiting_info. Luật
 * người-nhận nằm ở new-order-notify.helper (hàm thuần, test không cần mock);
 * ở đây chỉ đi gom id.
 *
 * Admin và Sale LUÔN có mặt, kể cả khi đơn đã được định tuyến xuống phòng —
 * trước đây nhánh có-phòng chỉ báo cho người của phòng, nên đơn sinh từ form
 * landing page vào hệ thống mà admin không hay biết gì.
 *
 * Tách khỏi OrdersService (thay vì để là private method) để giữ
 * orders.service.ts dưới mốc 300 dòng — create() và promoteIfComplete đều gọi
 * vào đây thay vì trùng lặp logic.
 */
export async function sendNewOrderNotification(
  deps: SendNewOrderNotificationDeps,
  orderId: number, deptIds: number[], serviceName: string, missingInfo: string[],
): Promise<void> {
  const order = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId }, select: { code: true, source: true },
  });
  const deptRecipientIds: number[] = [];
  for (const deptId of deptIds)
    deptRecipientIds.push(...(await deps.notify.deptRecipients(null, orderId, deptId)));

  await deps.notify.push(
    buildNewOrderRows({
      orderId,
      orderCode: order.code,
      serviceName,
      source: order.source,
      deptRecipientIds,
      staffIds: await deps.notify.adminsAndSales(),
      routed: deptIds.length > 0,
      missingInfo,
    }),
  );
}
