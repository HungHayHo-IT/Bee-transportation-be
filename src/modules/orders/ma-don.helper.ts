/** Tiền tố mã đơn và dấu phân cách đi kèm. */
export interface TienToMaDon {
  tienTo: string;
  /** '_' cho đơn có mã TMS, '-' cho đơn không có. */
  ngan: string;
}

/**
 * Viết tắt mã TMS: rút đoạn đầu về MỘT chữ cái, giữ nguyên phần sau.
 *
 *   EXPORT_FCL       -> E_FCL
 *   EXPORT_FCL_RU    -> E_FCL_RU
 *   PORTTRANSFER_LCL -> P_LCL
 *   DOMESTIC         -> D
 *
 * Năm đoạn đầu trong mười tám mã (EXPORT, IMPORT, DOMESTIC, CBT,
 * PORTTRANSFER) có chữ cái đầu khác nhau, nên luật một chữ không sinh ra hai
 * mã trùng.
 */
export function vietTatTms(mode: string): string {
  const i = mode.indexOf('_');
  return i < 0 ? mode.slice(0, 1) : mode.slice(0, 1) + mode.slice(i);
}

/**
 * Đơn KHÔNG có mã TMS giữ nguyên mã dịch vụ cha và dấu gạch ngang như từ
 * trước tới nay. Tám trong mười một dịch vụ của Bee — tư vấn, hải quan, dự án,
 * đóng gói, nâng hạ... — không nằm trong OF1-TMS; đổi mã của chúng là đổi thứ
 * không ai yêu cầu, và làm vỡ những mã đơn đã in trên hợp đồng.
 */
export function tienToMaDon(maDichVu: string, tmsMode: string | null): TienToMaDon {
  return tmsMode
    ? { tienTo: vietTatTms(tmsMode), ngan: '_' }
    : { tienTo: maDichVu, ngan: '-' };
}

/** Dịch vụ con đang bật — chỉ phần mà luật chọn tiền tố cần. */
export interface ConCoMa { id: number; tmsMode: string | null }

/**
 * Tiền tố mã đơn của một đơn sắp tạo.
 *
 * Mã TMS chỉ nằm ở dịch vụ CON (từ 049). Dịch vụ không chia nhỏ — tư vấn, hải
 * quan, cho thuê thiết bị — không có mã nào, và đơn của chúng giữ mã kiểu cũ.
 */
export function tienToCuaDon(
  dichVu: { code: string },
  conDangBat: ConCoMa[],
  chonCon: number | null | undefined,
): TienToMaDon {
  return tienToMaDon(dichVu.code, conDangBat.find((c) => c.id === chonCon)?.tmsMode ?? null);
}
