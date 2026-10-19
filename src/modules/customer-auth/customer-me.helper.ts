import { CustomerMeDto } from './dto/customer-auth.dto';

/**
 * Hàng `customer_accounts` kèm identities — đúng phần mà CustomerMeDto cần,
 * khai riêng để không kéo cả kiểu Prisma vào (test dựng row giả gọn hơn).
 */
export interface CustomerRowForMe {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  pinHash: string | null;
  avatarUrl?: string | null;
  identities: { provider: string }[];
}

/**
 * MỘT chỗ duy nhất dựng CustomerMeDto. Trước đây GET /customer-auth/me và
 * PATCH /customer-auth/me mỗi bên tự map một bản: thêm trường ở một bên mà quên
 * bên kia là hai endpoint trả hai hình dạng khác nhau, và FE mất dữ liệu ngay
 * sau khi khách bấm Lưu.
 *
 * `avatarUrl ?? null`: undefined bị JSON.stringify nuốt mất, client không phân
 * biệt nổi "chưa có ảnh" với "server cũ chưa biết trường này".
 */
export function toCustomerMe(c: CustomerRowForMe): CustomerMeDto {
  return {
    id: c.id,
    email: c.email,
    fullName: c.fullName,
    phone: c.phone,
    avatarUrl: c.avatarUrl ?? null,
    hasPin: c.pinHash !== null,
    providers: [...new Set(c.identities.map((i) => i.provider))],
  };
}
