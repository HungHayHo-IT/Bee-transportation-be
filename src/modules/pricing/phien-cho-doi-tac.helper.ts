import { ForbiddenException } from '@nestjs/common';
import { laDoiTac } from '@/common/scope/la-doi-tac';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';

/** Trạng thái phiên giá — chỉ 'active' là giá đã công bố. */
export const PHIEN_DANG_AP_DUNG = 'active';

/**
 * Phiên giá mà người gọi được phép đọc.
 *
 * Đối tác xem bảng giá niêm yết để đi báo giá cho khách của họ — hợp lý. Nhưng
 * bảng giá có nhiều PHIÊN, và phiên `draft` là giá kỳ sau CHƯA công bố. Để họ
 * truyền `?sessionId=` tuỳ ý là đưa giá tương lai cho một công ty khác đọc
 * trước, mà không ai bấm nút nào để cho phép chuyện đó.
 *
 * Nên với đối tác, tham số phiên bị BỎ QUA chứ không phải bị từ chối: họ không
 * gửi nó cũng không sao, và gửi thì cũng chỉ nhận đúng phiên đang áp dụng.
 * Từ chối bằng lỗi thì màn hình chung của hai bên phải tự biết mình là ai.
 */
export function phienDuocDoc(
  user: AuthenticatedUser,
  sessionId: number | undefined,
): number | undefined {
  return laDoiTac(user) ? undefined : sessionId;
}

/**
 * Chặn đối tác tải file của một phiên không phải phiên đang áp dụng.
 *
 * Khác hàm trên: ở đây id nằm trên đường dẫn và BẮT BUỘC, không có đường "bỏ
 * qua rồi lấy mặc định" — nên phải từ chối thẳng.
 */
export function chanTaiPhienKhac(
  user: AuthenticatedUser,
  sessionId: number,
  idPhienDangApDung: number | null,
): void {
  if (!laDoiTac(user)) return;
  if (idPhienDangApDung === null || sessionId !== idPhienDangApDung)
    throw new ForbiddenException('Chỉ tải được bảng giá đang áp dụng');
}
