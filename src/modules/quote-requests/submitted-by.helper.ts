/** Nguồn gửi yêu cầu báo giá, dẫn xuất từ hai cột `created_by` / `customer_id`. */
export type SubmittedBy = 'staff' | 'customer' | 'anonymous';

export const SUBMITTED_BY_VALUES: SubmittedBy[] = ['staff', 'customer', 'anonymous'];

/**
 * FE không nên phải tự suy ra nguồn từ hai cột null-able: `createdById = null`
 * đúng cho cả "khách đã đăng nhập" và "khách ẩn danh", nên chỉ nhìn cột đó là
 * gộp mất hai ca khác nhau.
 *
 * Nhân viên được ưu tiên khi cả hai cookie cùng tồn tại (cùng một browser vừa
 * đăng nhập nội bộ vừa đăng nhập cổng khách): bản ghi do nhân viên nhập hộ thì
 * người chịu trách nhiệm là nhân viên đó.
 */
export function deriveSubmittedBy(
  createdBy: number | null,
  customerId: number | null,
): SubmittedBy {
  if (createdBy !== null) return 'staff';
  if (customerId !== null) return 'customer';
  return 'anonymous';
}
