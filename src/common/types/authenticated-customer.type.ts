/**
 * Khách hàng đã đăng nhập — dùng cho CustomerJwtGuard. Tách khỏi
 * AuthenticatedUser (nhân viên nội bộ) để không lẫn quyền hay scope.
 */
export interface AuthenticatedCustomer {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  hasPin: boolean;
}
