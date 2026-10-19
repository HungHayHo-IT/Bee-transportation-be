/** Một dòng trong bảng giá, rút gọn còn những gì cần để so khớp. */
export interface DongNiemYet {
  originId: number | null;
  destinationId: number | null;
  serviceId: number;
  price: number;
}

/** Tuyến của một đơn. `null` = đơn chưa khai địa điểm đó. */
export interface TuyenCuaDon {
  originId: number | null;
  destinationId: number | null;
  serviceId: number;
}

/**
 * Giá niêm yết cho một đơn, hoặc null.

 * Ba luật, và cả ba đều là chuyện KHÔNG ĐOÁN:
 *
 * * Phải đúng CẢ BA: điểm đi, điểm đến, dịch vụ. Cùng tuyến nhưng dịch vụ
 *   khác là một giá khác.
 * * Chiều đi và chiều về là HAI tuyến. Lấy giá chiều ngược lại nghe như tiện,
 *   nhưng cước một chiều thường lệch nhau thật — xe chạy rỗng một chiều — và
 *   đoán hộ là báo khách một con số không ai duyệt.
 * * Đơn chưa khai địa điểm thì trả null. Không rơi về giá theo tỉnh/thành:
 *   một tỉnh có nhiều kho với giá khác nhau, và đó chính là lý do danh mục
 *   địa điểm tách riêng khỏi danh mục 63 tỉnh thành.
 *
 * Trả về null nghĩa là "bảng giá không nói gì về tuyến này", và màn báo giá
 * phải nói đúng như thế chứ không được điền một con số nào cả.
 */
export function chonGiaNiemYet(
  bang: readonly DongNiemYet[],
  don: TuyenCuaDon,
): DongNiemYet | null {
  if (don.originId === null || don.destinationId === null) return null;
  return (
    bang.find(
      (d) =>
        d.originId === don.originId &&
        d.destinationId === don.destinationId &&
        d.serviceId === don.serviceId,
    ) ?? null
  );
}
