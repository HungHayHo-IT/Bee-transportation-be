import { canReadAllOrders } from '@/common/scope/can-read-all-orders';

/** Chỉ những gì cần để phán quyết — dùng được cho cả hàng đọc thẳng từ DB. */
export interface MentionCandidate {
  id: number;
  roles: string[];
  departmentId: number | null;
}

export interface MentionContext {
  orderCreatedBy: number | null;
  /** Luồng đang viết: null là luồng chung. */
  threadDepartmentId: number | null;
  /** Các phòng được phân phối đơn này. */
  participatingDeptIds: Set<number>;
}

/**
 * Người này có được nhắc trong luồng đang viết không?
 *
 * Luật DUY NHẤT, dùng chung cho danh sách gợi ý và cho lúc lưu bình luận. Hai bên
 * lệch nhau là gợi ý ra người mà lúc gửi lại bị lọc bỏ — người dùng tưởng đã nhắc
 * còn người kia không nhận được gì.
 *
 * Điều kiện phải trùng quyền ĐỌC luồng (threadFilter trong comments.service), nếu
 * không thông báo sẽ dẫn tới đơn mở ra 404.
 */
export function canMention(candidate: MentionCandidate, ctx: MentionContext): boolean {
  if (candidate.id === ctx.orderCreatedBy) return true;
  if (canReadAllOrders(candidate)) return true;
  if (candidate.departmentId === null) return false;
  if (!ctx.participatingDeptIds.has(candidate.departmentId)) return false;
  // Luồng riêng của phòng khác -> không nhắc được.
  return ctx.threadDepartmentId === null || candidate.departmentId === ctx.threadDepartmentId;
}

/**
 * Bình luận này thuộc luồng nào. Tách ra để endpoint gợi ý @mention và endpoint viết
 * bình luận cùng suy ra một luồng — hỏi gợi ý ở luồng A rồi ghi vào luồng B thì danh
 * sách vô nghĩa.
 */
export function resolveThreadDepartment(
  user: { id: number; roles: string[]; departmentId: number | null },
  order: { createdBy: number | null },
  explicit: number | undefined,
): number | null {
  if (explicit !== undefined) return explicit;
  const free = canReadAllOrders(user) || order.createdBy === user.id;
  return free ? null : user.departmentId;
}
