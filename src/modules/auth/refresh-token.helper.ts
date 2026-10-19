import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh token sống 30 ngày, access token vẫn 12h như cũ.
 *
 * KHÔNG rút ngắn access token: FE web đang chạy dựa vào cookie 12h và không có
 * vòng refresh nào cả — rút xuống 15 phút là đá văng toàn bộ người dùng web mỗi
 * 15 phút. Refresh chỉ THÊM một lối cho client biết dùng nó (app mobile), không
 * đổi hành vi của client cũ.
 */
export const REFRESH_TTL_DAYS = 30;

const TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Token mờ (opaque) 32 byte ngẫu nhiên, KHÔNG phải JWT.
 *
 * JWT thì tự nó hợp lệ, thu hồi được chỉ khi có danh sách đen — mà đã phải tra
 * DB mỗi lần thì phần "tự chứng minh" của JWT chẳng còn giá trị gì. Chuỗi ngẫu
 * nhiên tra DB đơn giản hơn và thu hồi là chuyện hiển nhiên.
 */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256, cố ý KHÔNG dùng bcrypt ở đây dù mật khẩu thì dùng.
 *
 * Lý do 1 — tra cứu: request refresh chỉ mang mỗi token, không kèm id, nên phải
 * tìm dòng theo chính giá trị đó. bcrypt mỗi dòng một salt khác nhau nên muốn
 * so phải quét cả bảng; sha256 cho ra khoá tra được, đánh index UNIQUE.
 *
 * Lý do 2 — bcrypt sinh ra để làm CHẬM việc dò mật khẩu do người đặt (entropy
 * thấp). Token này là 256 bit ngẫu nhiên máy sinh: không có từ điển nào dò nổi,
 * nên cái chậm đó chỉ còn là chi phí.
 *
 * Điều KHÔNG được bỏ: bảng vẫn chỉ chứa hash. Rò DB mà có token thô thì kẻ đọc
 * được mạo danh mọi phiên đang mở.
 */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function refreshExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + TTL_MS);
}
