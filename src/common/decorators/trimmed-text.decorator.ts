import { Transform } from 'class-transformer';

/**
 * Cắt khoảng trắng hai đầu TRƯỚC khi validate.
 *
 * QA-32: `@IsString()` một mình coi "" và "   " là hợp lệ, nên lý do hủy đơn hay
 * bỏ qua đơn có thể rỗng. Đặt decorator này trước @IsNotEmpty; ngược lại thì
 * khoảng trắng vẫn qua cửa và còn được lưu nguyên vào DB.
 */
export const TrimmedText = (): PropertyDecorator =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
