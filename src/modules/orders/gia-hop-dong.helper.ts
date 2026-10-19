import { Prisma } from '@prisma/client';
import { giaChoKhach } from './gia-sale.helper';

/** Hình dạng tối thiểu cần để biết giá — khớp với truy vấn chi tiết đơn. */
export interface DonCoGia {
  finalAmount: Prisma.Decimal | number | null;
  source: string | null;
  salePrice: Prisma.Decimal | number | null;
  departmentId: number | null;
  departments: readonly { departmentId: number; amount: Prisma.Decimal | number | null }[];
}

/**
 * Giá để in lên hợp đồng.
 *
 * `orders.final_amount` chỉ được ghi lúc CHỐT ĐƠN, mà với luồng ký điện tử thì
 * chốt đơn xảy ra SAU khi khách ký. Nên đúng lúc gửi hợp đồng đi, nó vẫn null —
 * và tờ giấy khách nhận được in "Giá trị hợp đồng: ………" không có số tiền nào.
 * Đã hỏng thật trên production: đơn DOM-20261002-001, phòng thắng báo 32 triệu
 * mà hợp đồng để trống.
 *
 * Một hợp đồng vận chuyển không ghi giá thì ký xong cũng không chốt được điều
 * quan trọng nhất. Giá đã nằm sẵn ở báo giá của phòng thắng, nên lấy từ đó khi
 * chưa chốt.
 *
 * Thứ tự ưu tiên là final_amount TRƯỚC: sau khi chốt, báo giá của phòng vẫn có
 * thể bị sửa, còn doanh thu đã khoá thì không được đổi theo.
 */
export function giaHopDong(don: DonCoGia): number | null {
  if (don.finalAmount !== null) return Number(don.finalAmount);
  if (don.departmentId === null) return null;
  const thang = don.departments.find((d) => d.departmentId === don.departmentId);
  // Chưa báo giá thì trả null chứ KHÔNG trả 0: số 0 trên hợp đồng là một cam
  // kết miễn phí, còn ô trống thì ai đọc cũng biết là còn thiếu.
  // Đơn landing in giá Sale chốt với khách, không in giá phòng ban — xem gia-sale.helper.
  return giaChoKhach(don, thang?.amount ?? null);
}
