/** Dịch vụ con ĐANG BẬT của một dịch vụ — chỉ phần mà luật dưới đây cần. */
export interface ConDangBat {
  id: number;
  serviceId: number;
}

/**
 * Luật chọn dịch vụ con khi tạo / sửa đơn. Trả câu lỗi, hoặc null nếu hợp lệ.
 *
 * Vì sao "bắt buộc" lại phụ thuộc vào dịch vụ cha chứ không viết cứng: trong
 * mười một dịch vụ của Bee chỉ có ba dịch vụ vận chuyển được chia nhỏ theo mã
 * TMS. Bắt buộc với cả mười một thì tư vấn, hải quan, cho thuê thiết bị không
 * bao giờ tạo được đơn — không có dòng nào để chọn.
 *
 * Ngược lại, dịch vụ ĐÃ có dịch vụ con mà vẫn cho bỏ trống thì đơn vận chuyển
 * lọt qua không mang mã, và lúc đẩy sang OF1 mới phát hiện ra — muộn hơn một
 * bước so với chỗ sửa được.
 *
 * Trước 049 có một lối thoát nữa: dịch vụ cha mang sẵn mã thì bỏ trống cũng
 * được. Lối đó là ảo — lúc đẩy đơn, payload chỉ đọc mã của dịch vụ CON, nên
 * đơn đi qua lối ấy sang OF1 không mang mode nào cả.
 */
export function kiemDichVuCon(
  serviceId: number,
  chon: number | null | undefined,
  conDangBat: ConDangBat[],
  batBuoc: boolean,
): string | null {
  if (chon === undefined || chon === null) {
    if (batBuoc && conDangBat.length > 0)
      return 'Dịch vụ này cần chọn thêm dịch vụ con';
    return null;
  }

  if (conDangBat.length === 0)
    return 'Dịch vụ này không có dịch vụ con nào đang dùng';

  const con = conDangBat.find((c) => c.id === chon);
  // Gộp "không tồn tại", "đã tắt" và "thuộc dịch vụ khác" vào MỘT câu: cả ba
  // đều là cùng một thao tác sai, và tách ra thì câu lỗi kể cho người gọi biết
  // id nào có thật trong hệ thống.
  if (!con || con.serviceId !== serviceId)
    return 'Dịch vụ con không thuộc dịch vụ đã chọn, hoặc đã ngừng dùng';

  return null;
}
