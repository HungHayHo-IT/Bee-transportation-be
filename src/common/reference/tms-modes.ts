/**
 * Mã phương thức vận chuyển của OF1-TMS — mục 5, tài liệu "OF1-TMS Webhook —
 * Push TMS Bill" v1.0.
 *
 * Gửi một mã ngoài danh sách này thì OF1 từ chối NGUYÊN request, không phải
 * cảnh báo rồi bỏ qua. Nên danh sách được canh ở ba lớp: CHECK trong CSDL
 * (migration 040), @IsIn ở DTO, và ô chọn trên màn quản trị — cả ba đọc từ
 * đúng mảng này để không bao giờ lệch nhau.
 */
export const TMS_MODES = [
  'EXPORT_FCL',
  'EXPORT_FCL_RU',
  'EXPORT_LCL',
  'EXPORT_AIR',
  'EXPORT_BULK_CARGO',
  'IMPORT_FCL',
  'IMPORT_FCL_RU',
  'IMPORT_LCL',
  'IMPORT_AIR',
  'IMPORT_BULK_CARGO',
  'DOMESTIC',
  'DOMESTIC_FCL',
  'DOMESTIC_LCL',
  'CBT',
  'CBT_FCL',
  'CBT_LCL',
  'PORTTRANSFER_FCL',
  'PORTTRANSFER_LCL',
] as const;

/**
 * 14 mã mà contract OF1-TMS v1.3 (2026-10-08) thật sự nhận.
 *
 * KHÁC `TMS_MODES` ở trên, và cố ý khác. `TMS_MODES` là danh mục dịch vụ của
 * CHÍNH BeeOps — nó có `PORTTRANSFER_FCL/LCL` (đang dùng thật, 4 dịch vụ con
 * trên production) và hai mã trống `DOMESTIC`/`CBT`. Những mã đó là việc có
 * thật của công ty, chỉ là OF1 chưa nhận.
 *
 * Gộp hai danh sách làm một thì phải chọn một trong hai điều sai: hoặc xoá mã
 * khỏi danh mục dịch vụ — mất cấu hình của bốn dịch vụ con đang chạy — hoặc
 * gửi mã lạ sang OF1 và ăn 400 sau khi đã tốn một lượt gọi. Tách ra thì đơn
 * dùng mã ngoài contract bị chặn NGAY TẠI NHÀ, kèm câu nói rõ vì sao.
 */
export const TMS_MODES_OF1 = [
  'EXPORT_FCL', 'EXPORT_FCL_RU', 'EXPORT_LCL', 'EXPORT_AIR', 'EXPORT_BULK_CARGO',
  'IMPORT_FCL', 'IMPORT_FCL_RU', 'IMPORT_LCL', 'IMPORT_AIR', 'IMPORT_BULK_CARGO',
  'DOMESTIC_FCL', 'DOMESTIC_LCL', 'CBT_FCL', 'CBT_LCL',
] as const;

export type TmsMode = (typeof TMS_MODES)[number];
