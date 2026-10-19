import { Prisma } from '@prisma/client';

/** `orders.source` của đơn khách tự gửi (landing, app khách) — xem quote-request.service. */
export const NGUON_LANDING = 'website';

export function laDonLanding(source: string | null): boolean {
  return source === NGUON_LANDING;
}

type Tien = Prisma.Decimal | number | null;

/**
 * Giá khách phải trả, khi đơn CHƯA chốt (đã chốt thì đọc `finalAmount`).
 *
 * Sale đã nhập giá chốt (078) thì luôn là giá đó — mọi đơn.
 *
 * Sale chưa nhập:
 * - Đơn landing: null, KHÔNG rơi về giá phòng ban — giá phòng ban là giá vốn,
 *   không bao giờ được rời hệ thống tới khách landing.
 * - Đơn khác: giá của phòng thắng, như trước khi có giá chốt.
 *
 * MỌI chỗ đưa giá tới khách (báo giá, hợp đồng, chốt đơn) phải qua hàm này.
 */
export function giaChoKhach(
  // `?` — truy vấn cũ không select salePrice thì coi như chưa nhập.
  don: { source: string | null; salePrice?: Tien },
  giaPhongThang: Tien | undefined,
): number | null {
  if (don.salePrice !== null && don.salePrice !== undefined) return Number(don.salePrice);
  if (laDonLanding(don.source)) return null;
  return giaPhongThang === null || giaPhongThang === undefined ? null : Number(giaPhongThang);
}
