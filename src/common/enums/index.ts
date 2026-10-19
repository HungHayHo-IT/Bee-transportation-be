export enum Role {
  ADMIN = 'admin',
  LEADER = 'leader',
  MANAGER = 'manager',
  SALE = 'sale',
  STAFF = 'staff',
  /**
   * Điều vận — nhân viên phòng có dấu tích "Điều vận" (phòng Vận hành quản lý
   * tuyến giá của một khu vực). CHỈ XEM đơn có điểm đi thuộc khu vực phòng mình
   * quản lý, kể cả giá Sale đã chốt; KHÔNG báo giá (079).
   */
  DISPATCHER = 'dispatcher',
  /**
   * Người của công ty ĐỐI TÁC (Bee Logistics), không phải nhân viên Bee
   * Transportation. Chỉ xem được đơn của chính công ty họ — xem
   * DOI_TAC_XEM_DUOC trong permissions/pages.ts và nhánh riêng trong
   * ScopeService.orderWhere.
   *
   * CỐ TÌNH không nằm trong canReadAllOrders lẫn isCompanyWide: cả hai hàm đó
   * là danh sách CHO PHÉP nêu đích danh vai trò, nên vai trò mới tự động bị
   * loại. Đừng đổi chúng thành danh sách CẤM.
   */
  PARTNER = 'partner',
}

export const ALL_ROLES: string[] = Object.values(Role);

/**
 * Vòng đời đơn — BẢY trạng thái, kết thúc ở 'closed'.
 *
 * Rút từ mười một xuống bảy (23/09/2026). Bốn cái bỏ đi và lý do:
 *
 * - 'in_progress' và 'completed': hai cái này do việc tick mốc tiến độ tự đẩy,
 *   không ai bấm tay. Giờ mốc tiến độ vẫn chạy y nguyên và vẫn ghi completedAt
 *   khi tick hết, chỉ là không đổi trạng thái đơn nữa — đơn chốt rồi thì đứng ở
 *   'closed'. Theo dõi tiến độ giao hàng là việc của tab Tiến độ, không phải của
 *   trạng thái đơn.
 *
 * - 'rejected': gộp vào 'cancelled'. Lý do khách chê giá đi vào cancel_reason.
 *
 * - 'awaiting_customer': gộp vào 'awaiting_selection', nhãn đổi thành "Chờ chốt
 *   giá". Trước đây tách đôi "đã đủ báo giá, chờ sale chọn" và "sale chọn rồi,
 *   chờ khách gật"; thực tế hai bước đó dính liền nhau nên tách ra chỉ làm bảng
 *   Kanban dài thêm một cột mà không ai dùng.
 *
 * GIỮ nguyên khoá 'awaiting_selection' chứ không đặt khoá mới: app mobile đọc
 * thẳng orders.status, mỗi giá trị mới là một lần phải sửa bên đó. Nhãn đổi
 * nhưng khoá thì không.
 */
export enum OrderStatus {
  /**
   * Đơn sinh từ form báo giá công khai còn thiếu thông tin bắt buộc. Form đó cố
   * tình chỉ hỏi tên, số điện thoại và dịch vụ — điểm đi, điểm đến và trường
   * riêng của dịch vụ là việc nhân viên hỏi khách sau. Trước đây đơn như vậy
   * được gán thẳng 'distributed', phòng ban nhận về không có gì để báo giá.
   */
  AWAITING_INFO = 'awaiting_info',
  NEW = 'new',
  DISTRIBUTED = 'distributed',
  QUOTING = 'quoting',
  /** Nhãn "Chờ chốt giá" — gồm cả chờ sale chọn lẫn chờ khách xác nhận. */
  AWAITING_SELECTION = 'awaiting_selection',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

/** Trạng thái kết thúc — không chuyển đi đâu được nữa. */
export const TERMINAL_STATUSES: OrderStatus[] = [
  OrderStatus.CLOSED,
  OrderStatus.CANCELLED,
];

/** Đơn đã có doanh thu ghi nhận. Chốt là chốt, không còn tầng nào sau nữa. */
export const REVENUE_STATUSES: OrderStatus[] = [OrderStatus.CLOSED];

export enum DeptState {
  PENDING = 'pending',
  CLAIMED = 'claimed',
  QUOTED = 'quoted',
  PASSED = 'passed',
  WON = 'won',
  LOST = 'lost',
}

export enum MilestoneStatus {
  PENDING = 'pending',
  DONE = 'done',
  SKIPPED = 'skipped',
}

export enum OrderSource {
  WEBSITE = 'website',
  HOTLINE = 'hotline',
  EMAIL = 'email',
  EXISTING = 'existing',
}

export enum CommentKind {
  COMMENT = 'comment',
  REVISION_REQUEST = 'revision_request',
}

export enum NotifType {
  NEW_ORDER = 'new_order',
  ASSIGNED = 'assigned',
  QUOTE_RECEIVED = 'quote_received',
  ALL_PASSED = 'all_passed',
  REVISION_REQUESTED = 'revision_requested',
  QUOTE_WON = 'quote_won',
  QUOTE_LOST = 'quote_lost',
  ORDER_CLOSED = 'order_closed',
  ORDER_REJECTED = 'order_rejected',
  ORDER_CANCELLED = 'order_cancelled',
  MILESTONE_UPDATED = 'milestone_updated',
  SLA_LATE = 'sla_late',
  QUOTE_EXPIRED = 'quote_expired',
  MENTION = 'mention',
  QUOTE_REQUEST_NEW = 'quote_request_new',
  QUOTE_REQUEST_FAILED = 'quote_request_failed',
}

/**
 * Loại thông báo gửi cho KHÁCH HÀNG. Tách khỏi NotifType là cố ý: hai bên nói hai
 * ngôn ngữ khác nhau — nhân viên nghe "phòng bạn thắng vòng giá", khách nghe "báo
 * giá của bạn đã có". Gộp chung enum là sớm muộn cũng lộ chữ nội bộ ra mặt khách.
 */
export enum CustomerNotifType {
  QUOTE_REQUEST_RECEIVED = 'quote_request_received',
  QUOTE_READY = 'quote_ready',
  QUOTE_REQUEST_REJECTED = 'quote_request_rejected',
  ORDER_CLOSED = 'order_closed',
  ORDER_MILESTONE = 'order_milestone',
  ORDER_COMPLETED = 'order_completed',
  ORDER_CANCELLED = 'order_cancelled',
}

/** Lý do khách từ chối — danh sách cố định, không cần bảng danh mục. */
export const REJECT_REASONS = [
  'Giá cao',
  'Thời gian không đáp ứng',
  'Khách chọn đối thủ',
  'Khách hủy nhu cầu',
  'Khác',
] as const;
