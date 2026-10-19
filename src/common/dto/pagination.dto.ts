import { Type as NestType } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Trần cho `page`. Không có nó thì `?page=9007199254740991` cho
 * `skip = (page - 1) * limit` vượt kiểu `Int` của Prisma và bật 500 — đúng loại
 * lỗi mà `clamp` sinh ra để dập, nhưng năm controller lại truyền
 * `Number.MAX_SAFE_INTEGER` làm trần nên tự mở lại nó.
 */
export const MAX_PAGE = 1_000_000;

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, maximum: MAX_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * QA-05: một số danh sách trả mảng trần, số khác trả vỏ phân trang, nên mỗi service
 * ở front-end phải nhớ riêng từng dạng. Nay MỌI danh sách đều dùng vỏ này. Với các
 * danh mục nhỏ (phòng ban, dịch vụ, hàng đợi) không có phân trang thật — trả trọn
 * một trang để hình dạng đồng nhất, chứ không giả vờ có nhiều trang.
 */
export function onePage<T>(items: T[]): PageResult<T> {
  return { items, total: items.length, page: 1, limit: items.length };
}

/**
 * Query string luôn là chuỗi; số rác thì lấy mặc định thay vì ném 400.
 *
 * Trước đây hàm này bị chép sáu lần với hai chữ ký (bản ba tham số hardcode
 * `lo = 1`, bản bốn tham số nhận `lo` rồi mọi điểm gọi đều truyền `1`) — cùng
 * một hành vi, sáu nơi phải nhớ sửa.
 */
export function clamp(
  raw: string | undefined,
  fallback: number,
  lo: number,
  hi: number,
): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < lo) return fallback;
  return Math.min(n, hi);
}

/**
 * Swagger cần một LỚP CỤ THỂ cho mỗi vỏ phân trang — generic không dựng được
 * schema. Nhà máy này sinh lớp đó, thay cho việc chép tay cùng bốn field ở 12
 * nơi (và sẽ là 27 nơi sau đợt này).
 *
 * `Object.defineProperty` đặt lại `name` là BẮT BUỘC, không phải cho đẹp: mọi
 * lớp sinh ra đều mang cùng một tên, mà Swagger lấy tên lớp làm tên schema, nên
 * không đặt lại thì các schema đè lên nhau và tài liệu API sai im lặng.
 */
export function PagedDto(
  item: NestType<unknown> | typeof String,
  totalDescription?: string,
): NestType<object> {
  class Page {
    @ApiProperty({ type: [item] }) items!: unknown[];
    @ApiProperty(totalDescription ? { description: totalDescription } : {}) total!: number;
    @ApiProperty() page!: number;
    @ApiProperty() limit!: number;
  }
  Object.defineProperty(Page, 'name', { value: `Paged${item.name}` });
  return Page;
}
