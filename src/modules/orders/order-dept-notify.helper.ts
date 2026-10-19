import { NotifyInput, NotifyService } from '../notifications/notify.service';

/**
 * `reject()`/`cancel()` cùng một khuôn: gom người nhận của các phòng liên quan
 * rồi đẩy thông báo hàng loạt — chỉ khác nội dung từng dòng. Tách khỏi
 * OrdersService để hai chỗ gọi không tự lặp lại vòng lặp gom-người-nhận, và để
 * orders.service.ts không phình quá mốc 300 dòng vì hai bản sao gần giống hệt.
 */
export async function notifyDeptRows(
  notify: NotifyService,
  orderId: number,
  deptIds: number[],
  row: (userId: number) => NotifyInput,
): Promise<void> {
  const rows: NotifyInput[] = [];
  for (const deptId of deptIds)
    for (const userId of await notify.deptRecipients(null, orderId, deptId)) rows.push(row(userId));
  await notify.push(rows);
}
