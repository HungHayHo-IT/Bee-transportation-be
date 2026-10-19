/**
 * Câu báo lỗi khi nhập bảng giá không dùng được dòng nào.
 *
 * Nhập Excel khớp địa điểm và dịch vụ THEO TÊN với danh mục có sẵn. Danh mục
 * rỗng thì mọi dòng đều trượt, và câu báo cũ — `không có địa điểm "đà nẵng"` —
 * đọc như "bạn gõ sai tên", trong khi sự thật là chưa có cái tên nào để mà so.
 * Người dựng hệ thống lần đầu sẽ ngồi sửa chính tả trong file, mãi không ra.
 */

export interface BoiCanhLoiNhap {
  /** Lý do bỏ từng dòng, theo thứ tự đọc file. */
  boQua: readonly string[];
  /** Số địa điểm đang có trong danh mục. */
  soDiaDiem: number;
  /** Số đơn vị tính đang có. */
  soDonVi: number;
}

export function loiNhapBangGia({ boQua, soDiaDiem, soDonVi }: BoiCanhLoiNhap): string {
  /* Danh mục rỗng nói trước mọi lý do khác: khi chưa có địa điểm nào thì lỗi
     của từng dòng chỉ là hệ quả, và chỉ đúng một việc sửa được — đi tạo danh
     mục. Nói tên dòng đầu tiên lúc này là chỉ sai chỗ. */
  if (soDiaDiem === 0) {
    return (
      'Danh mục địa điểm đang trống nên không dòng nào khớp được. ' +
      'Vào màn Địa điểm tạo các kho/cảng trước, rồi nhập lại — ' +
      'tên trong file phải trùng tên trong danh mục.'
    );
  }
  if (soDonVi === 0) {
    return (
      'Chưa có đơn vị tính nào nên không dòng nào khớp được — ' +
      'migration 055 chưa chạy trên máy chủ này.'
    );
  }
  if (boQua.length === 0) return 'File không có dòng dữ liệu nào';

  /* Có bao nhiêu dòng trượt là thông tin: một dòng hỏng khác hẳn cả trăm dòng
     hỏng, và người đọc cần biết mình đang sửa một lỗi gõ hay sai cả file. Chỉ
     in lý do của dòng ĐẦU vì các dòng sau thường trượt cùng một kiểu. */
  const dau = boQua[0] ?? '';
  return boQua.length === 1
    ? `Không dòng nào dùng được. ${dau}`
    : `Không dòng nào dùng được (${boQua.length} dòng bị bỏ). ${dau}`;
}
