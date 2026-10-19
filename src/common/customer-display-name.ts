/**
 * Tên gọi của một khách hàng trên mọi màn hình: tên công ty, hoặc tên người
 * liên hệ nếu chưa có tên công ty.
 *
 * Khách đến từ form báo giá trên website KHÔNG có tên công ty — form đó chỉ hỏi
 * tên người, và sẽ không hỏi thêm. Đọc mỗi `companyName` thì cột "Tên công ty"
 * ở danh sách đơn hiện dấu gạch ngang cho đúng những đơn đang cần người xử lý
 * nhất, còn chấm đủ/thiếu thì đòi "Tên khách hàng" trong khi màn hình đang hiện
 * tên rõ ràng — không ai hiểu nổi vì sao đơn kẹt.
 *
 * Dùng CHUNG ở mọi đường đọc tên khách: danh sách đơn, chi tiết đơn, hàng đợi,
 * dashboard, Excel, chấm đủ/thiếu. Chép tay điều kiện này ở chỗ khác là để lại
 * đúng một chỗ hiện sai, và đó sẽ là chỗ không ai nghĩ tới.
 */
export function customerDisplayName(
  customer: { companyName?: string | null; contactName?: string | null } | null | undefined,
): string | null {
  if (!customer) return null;
  return customer.companyName?.trim() || customer.contactName?.trim() || null;
}
