/**
 * Bảy ô "Thông số hàng hóa" chung. Chúng là CỘT THẬT trong `orders` chứ không nằm
 * trong `service_data`: đơn giá tham khảo (F3), bộ lọc và dashboard đều khớp trên
 * các cột này, đưa xuống JSONB là phải viết lại cả ba.
 *
 * `services.cargo_fields` chỉ quyết định ô nào HIỆN trên form của dịch vụ đó —
 * ví dụ CON (tư vấn) và RNT (cho thuê thiết bị) không có lô hàng nào để đo.
 */
export const CARGO_FIELD_KEYS = [
  'weightKg',
  'volumeCbm',
  'packageCount',
  'containerType',
  'dimLM',
  'dimWM',
  'dimHM',
] as const;

export type CargoFieldKey = (typeof CARGO_FIELD_KEYS)[number];

/** Nhãn tiếng Việt — dùng cho thông báo lỗi và tiêu đề cột Excel. */
export const CARGO_FIELD_LABEL: Record<CargoFieldKey, string> = {
  weightKg: 'Khối lượng (kg)',
  volumeCbm: 'Thể tích (CBM)',
  packageCount: 'Số kiện / container',
  containerType: 'Loại container',
  dimLM: 'Dài (m)',
  dimWM: 'Rộng (m)',
  dimHM: 'Cao (m)',
};

export function isCargoFieldKey(value: string): value is CargoFieldKey {
  return (CARGO_FIELD_KEYS as readonly string[]).includes(value);
}

/** Kiểu ô nhập của một trường riêng. */
export const SERVICE_FIELD_TYPES = ['text', 'number', 'select', 'date', 'boolean'] as const;

export type ServiceFieldType = (typeof SERVICE_FIELD_TYPES)[number];
