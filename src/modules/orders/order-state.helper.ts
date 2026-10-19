import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@/common/enums';

/**
 * Máy trạng thái đơn hàng. MỌI thay đổi `status` phải đi qua assertTransition —
 * kể cả close(), cancel(), và các bước tự động của settleCheck / milestones.
 */
export const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  // Một chiều: vào đây chỉ bằng đúng một cửa là lúc tạo từ form công khai.
  // Không nhánh nào quay ngược lại — xem test "không quay ngược".
  [OrderStatus.AWAITING_INFO]: [
    OrderStatus.NEW,
    OrderStatus.DISTRIBUTED,
    OrderStatus.CANCELLED,
  ],

  [OrderStatus.NEW]: [OrderStatus.DISTRIBUTED, OrderStatus.CANCELLED],

  // distributed -> awaiting_selection: đơn chỉ có 1 phòng phụ trách, phòng đó báo giá
  // xong là "mọi phòng đã trả lời". Thiếu nhánh này thì settleCheck ném 409 ở ca
  // phổ biến nhất.
  [OrderStatus.DISTRIBUTED]: [
    OrderStatus.QUOTING,
    OrderStatus.AWAITING_SELECTION,
    OrderStatus.CANCELLED,
  ],

  [OrderStatus.QUOTING]: [OrderStatus.AWAITING_SELECTION, OrderStatus.CANCELLED],

  // "Chờ chốt giá" — gồm cả chờ sale chọn lẫn chờ khách gật. Chọn báo giá thắng
  // KHÔNG còn đổi trạng thái: đơn nằm yên ở đây cho tới lúc chốt hoặc huỷ.
  // Quay về 'quoting' là đường mở lại vòng giá.
  [OrderStatus.AWAITING_SELECTION]: [
    OrderStatus.CLOSED,
    OrderStatus.QUOTING,
    OrderStatus.CANCELLED,
  ],

  // Hai trạng thái kết thúc. 'closed' còn huỷ được — đơn đã chốt vẫn có thể
  // đổ bể sau đó; tick mốc tiến độ thì KHÔNG đổi trạng thái nữa.
  [OrderStatus.CLOSED]: [OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
};

const LABEL: Record<string, string> = {
  awaiting_info: 'Cần bổ sung thông tin',
  new: 'Mới tạo',
  distributed: 'Đã phân phối',
  quoting: 'Đang báo giá',
  awaiting_selection: 'Chờ chốt giá',
  closed: 'Đã chốt',
  cancelled: 'Đã hủy',
};

export function statusLabel(status: string): string {
  return LABEL[status] ?? status;
}

/** Truyền BIẾN trạng thái thật vào `from`, đừng viết cứng — viết cứng thì hàm không kiểm tra gì cả. */
export function assertTransition(from: string, to: OrderStatus): void {
  const allowed = ALLOWED[from as OrderStatus];
  if (allowed?.includes(to)) return;

  // QA-18: bấm hai lần thì thông báo cũ đọc thành 'không chuyển từ "Đã hủy" sang
  // "Đã hủy"' — nghe như lỗi hệ thống. Nói thẳng là đã ở trạng thái đó rồi.
  if (from === to)
    throw new ConflictException(`Đơn đang ở trạng thái "${statusLabel(to)}" rồi`);

  throw new ConflictException(
    `Không thể chuyển đơn từ "${statusLabel(from)}" sang "${statusLabel(to)}"`,
  );
}

/**
 * Trạng thái mà phòng ban còn thao tác được: tiếp nhận, gán người, bỏ qua, báo giá.
 *
 * KHÔNG dùng ALLOWED[status].length để suy ra — đơn đã chốt vẫn đi tiếp được
 * (sang 'cancelled') nhưng vòng báo giá đã đóng từ lâu. "Còn đi tiếp được" và
 * "phòng ban còn làm được gì" là hai câu hỏi khác nhau.
 */
export const DEPT_WORKABLE: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.DISTRIBUTED,
  OrderStatus.QUOTING,
  OrderStatus.AWAITING_SELECTION,
];

/**
 * Trạng thái còn ghi nhận được "khách từ chối".
 *
 * Phải khai riêng chứ không suy ra từ ALLOWED: đích đến của reject() giờ là
 * 'cancelled', mà huỷ thì hợp lệ từ cả 'closed' — để máy trạng thái gác một
 * mình thì "Khách từ chối" sẽ nuốt luôn đơn ĐÃ CHỐT. Khách không thể từ chối
 * một cái giá đã chốt xong.
 */
export const REJECTABLE_STATUSES: OrderStatus[] = [
  OrderStatus.DISTRIBUTED,
  OrderStatus.QUOTING,
  OrderStatus.AWAITING_SELECTION,
];

/**
 * QA-31: máy trạng thái chặn close/reject/select trên đơn terminal, nhưng các
 * endpoint của phòng ban chỉ nhìn order_departments.state nên báo giá vào đơn đã
 * hủy vẫn trả 201 và ghi thật. Mọi endpoint phòng ban phải gọi hàm này.
 */
export function assertDeptWorkable(status: string): void {
  if (DEPT_WORKABLE.includes(status as OrderStatus)) return;
  throw new ConflictException(
    `Đơn đang ở trạng thái "${statusLabel(status)}", phòng ban không thao tác được nữa`,
  );
}
