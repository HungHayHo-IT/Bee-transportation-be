import { FastifyRequest } from 'fastify';

/** Người gọi, dựng lại từ DB ở mỗi request (không lấy từ claim trong token). */
export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string;
  roles: string[];
  departmentId: number | null;
  canViewCompanyReport: boolean;
  /** Co "Xem toan bo don (chi xem)". Chi mo duong DOC — xem ScopeService.orderReadWhere.
   *  Tuy chon: dung tay o test thi bo trong la tat. */
  canViewAllOrders?: boolean;
  mustChangePassword: boolean;
  /**
   * Có khi người dùng là Điều vận hoặc Trưởng phòng của một phòng KHÔNG phải
   * Phòng Sale / Phòng báo giá (080): các dịch vụ phòng đó tích trên ma trận
   * định tuyến. Đọc từ DB mỗi request như mọi quyền khác.
   */
  dieuVan?: { departmentId: number; serviceIds: readonly number[] };
}

export type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/** Dòng đơn hàng tối thiểu để quyết định có được xem doanh thu hay không. */
export interface OrderMoneyRow {
  createdBy: number | null;
  departmentId: number | null;
  /** Để biết điều vận được xem giá đơn này không — xem dieu-van.ts. */
  serviceId?: number;
  status?: string;
}
