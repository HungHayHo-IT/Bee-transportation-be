import { Prisma } from '@prisma/client';
import { Role } from '@/common/enums';

/**
 * Đơn CHƯA CÓ SALE phụ trách — mọi Sale đều thấy, để có người nhận.
 *
 * Không có cột `sale_id`: `orders.created_by` CHÍNH LÀ sale của đơn, và cột
 * "Sale" trên danh sách đọc thẳng từ đó. Nên "nhận đơn" chỉ là đổi `created_by`.
 *
 * HAI vế, và thiếu vế nào cũng sai:
 *
 * 1. `created_by` NULL — đơn khách tự gửi từ landing (075, 13/10/2026). Trước
 *    đây đơn này đứng tên tài khoản hệ thống public@bee.internal; tài khoản đó
 *    bị xoá nhầm là mọi đơn từ website chết theo.
 * 2. Người tạo không mang vai Sale. Đơn Quản trị viên nhập hộ rơi vào đây:
 *    chưa ai trong đội kinh doanh đứng tên nó.
 *
 * Dùng CHUNG ở hai nơi và phải là hai nơi duy nhất: ScopeService.orderWhere
 * (ai thấy đơn nào) và nhanDon (còn nhận được nữa không). Lệch nhau là Sale
 * thấy nút "Nhận đơn" rồi bấm vào ăn 409, hoặc ngược lại.
 */
export const DON_CHUA_CO_SALE: Prisma.OrderWhereInput = {
  OR: [
    { createdBy: null },
    { creator: { NOT: { roles: { has: Role.SALE } } } },
  ],
};

/** Như trên nhưng cho một đơn ĐÃ nạp sẵn người tạo — tránh hỏi DB lần nữa. */
export function chuaCoSale(creator: { roles: string[] } | null): boolean {
  return creator === null || !creator.roles.includes(Role.SALE);
}
