/**
 * Dịch một ô văn bản của PATCH thành thứ Prisma hiểu.
 *
 * Trả `undefined` = không đụng tới cột; `null` = xoá; chuỗi = ghi đè. Đây là
 * chỗ duy nhất quyết định điều đó, để mô tả và ảnh không mỗi cái một kiểu.
 *
 * Rỗng lưu NULL chứ không lưu chuỗi rỗng: hai cách biểu diễn cho cùng một
 * nghĩa "chưa có" là bắt mọi chỗ đọc phải kiểm hai lần, và sớm muộn sẽ có chỗ
 * quên một nửa.
 */
export function oChuoiGhiDe(giaTri: string | undefined): string | null | undefined {
  if (giaTri === undefined) return undefined;
  return giaTri.trim() || null;
}
