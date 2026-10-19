import { createHash, randomBytes } from 'node:crypto';

/**
 * Luật thuần của việc ký điện tử — không chạm cơ sở dữ liệu, không chạm S3.
 *
 * Tách ra để kiểm được mà không phải dựng cả Prisma: đây là chỗ quyết định một
 * đường dẫn ký còn sống hay đã chết, và một lỗi ở đây là một chữ ký không có
 * giá trị chứ không phải một màn hình xấu.
 */

export const TrangThaiKy = {
  CHO_KY: 'cho_ky',
  DA_KY: 'da_ky',
  TU_CHOI: 'tu_choi',
  HET_HAN: 'het_han',
} as const;
export type TrangThaiKy = (typeof TrangThaiKy)[keyof typeof TrangThaiKy];

/** Đường dẫn ký sống bảy ngày. Đủ cho khách xem lại, đủ ngắn để không trôi nổi. */
export const SO_NGAY_SONG = 7;

/**
 * Mã một lần cho đường dẫn ký.
 *
 * 32 byte ngẫu nhiên in ra hex — không gian dò lớn hơn mọi số lần gửi ký cộng
 * lại nhiều bậc, nên không cần thêm lớp nào khác để chống dò bằng máy. Dùng
 * `randomBytes` chứ không phải `Math.random`: cái sau đoán được.
 */
export function sinhToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Băm mã trước khi lưu.
 *
 * Lưu dạng băm chứ không lưu mã gốc, cùng một lý do với mật khẩu: ai đọc được
 * cơ sở dữ liệu cũng không ký thay khách được. SHA-256 không muối là đủ ở đây
 * — mã đã là 32 byte ngẫu nhiên, không có từ điển nào dựng sẵn được.
 */
export function bamToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Thời điểm hết hạn, tính từ lúc gửi. */
export function hetHanLuc(luc: Date): Date {
  return new Date(luc.getTime() + SO_NGAY_SONG * 24 * 60 * 60 * 1000);
}

/** Đúng thời điểm hết hạn là hết — không có phút ân huệ nào. */
export function vanConHieuLuc(hetHan: Date, bayGio: Date): boolean {
  return bayGio.getTime() < hetHan.getTime();
}

export type KetQuaKiemTra = { duoc: true } | { duoc: false; vi: string };

/**
 * Yêu cầu ký này còn ký được không.
 *
 * Trả kèm LÝ DO chứ không phải một chữ `false`: người mở đường dẫn cần biết
 * mình đang vướng cái gì — hết hạn thì đi xin link mới, đã ký rồi thì thôi.
 */
export function duocKy(
  trangThai: TrangThaiKy,
  hetHan: Date,
  bayGio: Date,
): KetQuaKiemTra {
  if (trangThai === TrangThaiKy.DA_KY) {
    return { duoc: false, vi: 'Phiếu này đã được ký rồi' };
  }
  if (trangThai === TrangThaiKy.TU_CHOI) {
    return { duoc: false, vi: 'Phiếu này đã bị từ chối' };
  }
  /* Trạng thái còn 'cho_ky' nhưng đồng hồ đã qua hạn cũng là hết hạn. Không có
     tiến trình nào quét để đổi trạng thái, nên phải tự nhận ra ở đây — không
     thì một đường dẫn quá hạn vẫn ký được cho tới khi ai đó đụng vào nó. */
  if (trangThai === TrangThaiKy.HET_HAN || !vanConHieuLuc(hetHan, bayGio)) {
    return { duoc: false, vi: 'Đường dẫn ký đã hết hạn' };
  }
  return { duoc: true };
}
