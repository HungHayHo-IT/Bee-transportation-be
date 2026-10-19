import { Logger } from '@nestjs/common';
import { NotifType } from '@/common/enums';
import { ServiceCodeProblem } from './service-code.helper';
import { NotifyService } from '../notifications/notify.service';

const logger = new Logger('QuoteRequestNotify');

/**
 * Hai ca yêu cầu báo giá trước đây rơi vào im lặng hoàn toàn:
 * - không có serviceId  -> không convert -> không sinh Order -> NEW_ORDER không bắn
 * - auto-convert ném lỗi -> chỉ vào activity log
 * Cả hai đều để bản ghi nằm im ở status='pending' tới khi có người tình cờ mở.
 *
 * Nhận `getRecipients` dạng thunk thay vì mảng đã resolve: tra người nhận
 * (admins()/adminsAndSales()) là một lệnh gọi DB riêng, không có try/catch nội
 * bộ như push(). Bọc CẢ việc tra người nhận LẪN việc push trong CÙNG một
 * try/catch ở đây — chỉ một chỗ canh, bảo vệ được cả hai điểm gọi — vì bản ghi
 * quote_request của khách đã được lưu trước đó và không được để một trục trặc
 * DB ở bước "báo cho nhân viên" làm hỏng request của khách. Nếu gọi
 * `await this.notify.admins()` NGOÀI hàm này rồi mới truyền mảng vào, lỗi sẽ
 * ném ra trước khi hàm này kịp chạy — try/catch bên trong sẽ không bắt được.
 * Tách khỏi QuoteRequestService để giữ file dưới giới hạn 300 dòng.
 */
export async function notifyStaff(
  notify: NotifyService,
  getRecipients: () => Promise<number[]>,
  quoteRequestId: number,
  type: NotifType,
  title: string,
  body: string,
): Promise<void> {
  try {
    const recipients = await getRecipients();
    await notify.push(
      recipients.map((userId) => ({ userId, quoteRequestId, type, title, body })),
    );
  } catch (err) {
    logger.warn(
      `Báo nhân viên cho quote_request ${quoteRequestId} thất bại: ${(err as Error).message}`,
    );
    // Không rethrow — request của khách đã lưu xong, lỗi ở bước báo tin không
    // được phép làm hỏng nó.
  }
}

/** Nội dung cho ca không có serviceId — Admin và Sale cùng xử lý. */
export function newRequestMessage(
  quoteRequestId: number, customerName: string, phone: string,
): { title: string; body: string } {
  return {
    title: `Yêu cầu báo giá #${quoteRequestId} chưa có dịch vụ`,
    body: `${customerName.trim()} — ${phone.trim()}. Chưa chọn được dịch vụ nên chưa tạo đơn tự động.`,
  };
}

/** Nội dung cho ca auto-convert ném lỗi — chỉ Admin, đây là sự cố kỹ thuật. */
export function convertFailedMessage(
  quoteRequestId: number, customerName: string, phone: string,
): { title: string; body: string } {
  return {
    title: `Yêu cầu báo giá #${quoteRequestId} không tạo được đơn`,
    body: `${customerName.trim()} — ${phone.trim()}. Cần tạo đơn thủ công.`,
  };
}

/**
 * Nội dung cho ca form gửi LÊN một mã dịch vụ, nhưng mã đó không dùng được.
 *
 * Tách khỏi newRequestMessage vì hai ca đòi hành động khác hẳn nhau: "khách
 * không chọn dịch vụ" là việc của Sale (gọi hỏi khách cần gì), còn "mã gửi lên
 * không khớp" là trục trặc KỸ THUẬT ở phía gửi — bảng ánh xạ bên landing page
 * lệch, hoặc dịch vụ vừa bị tắt trong admin. Gộp chung một câu thì người nhận
 * không thể biết phải sửa ở đâu, và đó đúng là chuyện đã xảy ra.
 */
export function unknownServiceCodeMessage(
  quoteRequestId: number, customerName: string, phone: string,
  problem: ServiceCodeProblem,
): { title: string; body: string } {
  const vande = problem.reason === 'inactive'
    ? `Dịch vụ mã "${problem.code}" đã ngừng nhận.`
    : `Mã dịch vụ "${problem.code}" không khớp dịch vụ nào.`;
  return {
    title: `Yêu cầu báo giá #${quoteRequestId} gửi mã dịch vụ không dùng được`,
    body: `${customerName.trim()} — ${phone.trim()}. ${vande} Chưa tạo đơn tự động.`,
  };
}
