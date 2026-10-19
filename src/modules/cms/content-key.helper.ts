import { BadRequestException } from '@nestjs/common';

/**
 * Khối nội dung CMS không được đụng tới.
 *
 * Băng kêu gọi hành động ("Bạn có lô hàng cần vận chuyển?") là khối duy nhất
 * chủ thương hiệu giữ lại. Chặn ở tầng dữ liệu chứ không chỉ ẩn trên giao diện:
 * ẩn nút thì một lần gọi API thẳng vẫn ghi đè được.
 */
export const LOCKED_PREFIXES: string[] = ['ctaBand'];

/** Đoạn khoá đụng tới nguyên mẫu Object — xem giải thích ở assertKeyPath. */
const NGUY_HIEM = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Ô ĐỊNH TUYẾN của một dịch vụ — không phải chữ nghĩa, không cho CMS ghi đè.
 *
 * `slug` là địa chỉ trang, `code` là mã dịch vụ bên BeeOps. Màn Nội dung đã
 * lọc hai ô này ra khỏi danh mục, nhưng ẩn nút không phải là chặn: một lần gọi
 * API thẳng vẫn ghi được, và ghi đè `slug` là gãy mọi đường link đã phát ra
 * ngoài, còn ghi đè `code` là form báo giá gửi về một dịch vụ không tồn tại.
 */
const O_DINH_TUYEN = /^services\.items\.[^.]+\.(slug|code)$/;

/** Chữ, số, gạch dưới, gạch nối. Chỉ số mảng là một đoạn toàn số. */
const DOAN_HOP_LE = /^[A-Za-z0-9_-]+$/;

const DAI_TOI_DA = 200;

/**
 * Khoá này có nằm trong khối bị khoá không.
 *
 * So theo ĐOẠN chứ không phải theo chuỗi: 'ctaBandit.title' chỉ trùng tiền tố
 * chữ cái, nó là một khoá khác và phải sửa được.
 */
export function isLockedKey(keyPath: string): boolean {
  const dau = keyPath.split('.')[0];
  return LOCKED_PREFIXES.includes(dau ?? '');
}

/**
 * Chặn mọi khoá không hợp lệ trước khi nó xuống DB.
 *
 * Khoá đi thẳng từ trình duyệt xuống bảng rồi được landing dùng để ĐI DỌC và
 * GÁN vào cây từ điển. Vì vậy '__proto__' hay 'constructor.prototype' không
 * phải là khoá xấu về hình thức — chúng sửa được nguyên mẫu Object của tiến
 * trình đang render, tức là một dòng trong DB đổi được hành vi của cả trang.
 * Landing sẽ tự chặn lần nữa khi trộn, nhưng dữ liệu bẩn không nên vào tới đó.
 */
export function assertKeyPath(keyPath: string): void {
  if (!keyPath || keyPath.length > DAI_TOI_DA)
    throw new BadRequestException(`Khoá nội dung rỗng hoặc dài quá ${DAI_TOI_DA} ký tự`);

  const doan = keyPath.split('.');
  for (const d of doan) {
    if (!DOAN_HOP_LE.test(d))
      throw new BadRequestException(
        `Khoá nội dung "${keyPath}" có đoạn không hợp lệ: "${d}"`,
      );
    if (NGUY_HIEM.has(d))
      throw new BadRequestException(`Khoá nội dung "${keyPath}" đụng tới nguyên mẫu`);
  }

  if (isLockedKey(keyPath))
    throw new BadRequestException(`Khối "${doan[0]}" không mở cho CMS`);

  if (O_DINH_TUYEN.test(keyPath))
    throw new BadRequestException(
      `"${keyPath}" là đường dẫn/mã dịch vụ, không phải nội dung — sửa ở màn Dịch vụ`,
    );
}
