/** Một điều của điều khoản ký, chỉ phần mà hàm ghép cần. */
export interface DieuKhoanRow {
  title: string;
  body: string;
}

/**
 * Ghép các điều đang bật thành MỘT văn bản để khách đọc và ký.
 *
 * Đánh số ở đây chứ không bắt người soạn tự gõ "Điều 1", "Điều 2": tự gõ thì
 * xoá một điều ở giữa là cả danh sách lệch số, và không ai nhớ sửa lại.
 *
 * Mảng rỗng trả chuỗi rỗng chứ không ném lỗi — bên gọi quyết định làm gì với
 * nó, và chỗ đó mới biết đang gửi cho khách hay chỉ xem thử.
 */
export function ghepDieuKhoan(dieu: readonly DieuKhoanRow[]): string {
  return dieu
    .map((d, i) => `${i + 1}. ${d.title.trim()}\n${d.body.trim()}`)
    .join('\n\n');
}
