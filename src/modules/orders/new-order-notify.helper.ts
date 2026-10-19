import { NotifType } from '@/common/enums';

/**
 * Dựng danh sách thông báo cho một đơn vừa tạo.
 *
 * Trước đây việc này nằm trong OrdersService và chỉ bắn xuống phòng được định
 * tuyến, nên đơn tạo THÀNH CÔNG thì Admin hoàn toàn im lặng — Admin chỉ nghe
 * thấy tiếng khi có sự cố ("chưa định tuyến", "không tạo được đơn"). Đơn từ
 * form landing page vì thế vào hệ thống mà không ai ngoài phòng phụ trách biết.
 *
 * Tách ra thành hàm THUẦN: không chạm Prisma, không chạm NotifyService, nên
 * test được toàn bộ luật người-nhận mà không cần mock gì. OrdersService chỉ còn
 * việc đi gom id rồi gọi vào đây — cũng giữ orders.service.ts dưới mốc 300 dòng.
 */
export interface NewOrderNotifyInput {
  orderId: number;
  orderCode: string;
  serviceName: string;
  /** `orders.source` — 'website' là đơn sinh từ form báo giá của landing page. */
  source: string | null;
  /** Người của các phòng được định tuyến (đã gộp, đã lọc tài khoản khoá). */
  deptRecipientIds: number[];
  /** Admin và Sale — luôn được báo, kể cả khi họ không thuộc phòng nào. */
  staffIds: number[];
  /** Đơn có được định tuyến tới phòng nào không. KHÁC với "phòng có người". */
  routed: boolean;
  /**
   * Nhãn các trường đơn còn thiếu (từ missingOrderInfo). Có phần tử nghĩa là đơn
   * đang ở awaiting_info.
   */
  missingInfo?: string[];
}

export interface NewOrderNotifyRow {
  userId: number;
  orderId: number;
  type: NotifType;
  title: string;
  body: string;
}

export function buildNewOrderRows(input: NewOrderNotifyInput): NewOrderNotifyRow[] {
  const { orderId, orderCode, serviceName, source, routed } = input;
  const row = (userId: number, title: string, body: string): NewOrderNotifyRow => ({
    userId, orderId, type: NotifType.NEW_ORDER, title, body,
  });

  // Phải đứng TRƯỚC nhánh !routed: đơn chờ bổ sung cũng chưa định tuyến, nhưng
  // nguyên nhân khác hẳn — dịch vụ vẫn có phòng phụ trách, ta cố ý không phân.
  // Gộp vào một nhãn thì admin đi sửa cấu hình phòng ban trong khi việc cần làm
  // là gọi cho khách hỏi điểm đi.
  if (input.missingInfo?.length) {
    const thieu = input.missingInfo.join(', ');
    return input.staffIds.map((userId) =>
      row(
        userId,
        `Đơn ${orderCode} cần bổ sung thông tin`,
        `Dịch vụ "${serviceName}". Còn thiếu: ${thieu}.`,
      ),
    );
  }

  // Chưa phòng nào phụ trách: đây là việc cần xử lý, không phải tin mừng. Báo
  // Admin/Sale bằng đúng một loại nội dung, không trộn với bản "đơn mới" thường.
  if (!routed) {
    return input.staffIds.map((userId) =>
      row(
        userId,
        `Đơn ${orderCode} chưa định tuyến`,
        `Dịch vụ "${serviceName}" chưa có phòng nào phụ trách.`,
      ),
    );
  }

  const title = `Đơn mới ${orderCode}`;
  const seen = new Set<number>();
  const rows: NewOrderNotifyRow[] = [];

  // Người của phòng đi trước: bản của họ cụ thể hơn, sát việc hơn. Ai vừa là
  // Admin vừa ở trong phòng thì giữ bản này và không nhận thêm bản tổng quan —
  // bảng notifications không có ràng buộc UNIQUE nào nên `skipDuplicates` của
  // Prisma không gỡ trùng hộ, phải khử ngay ở đây.
  for (const userId of input.deptRecipientIds) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    rows.push(row(userId, title, `Dịch vụ "${serviceName}" vừa được phân phối tới phòng bạn.`));
  }

  const overview = source === 'website'
    ? `Dịch vụ "${serviceName}". Nguồn: form website.`
    : `Dịch vụ "${serviceName}".`;
  for (const userId of input.staffIds) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    rows.push(row(userId, title, overview));
  }

  return rows;
}
