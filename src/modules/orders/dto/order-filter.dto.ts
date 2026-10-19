import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { OrderStatus } from '@/common/enums';

/** Cột được phép sắp xếp trên /orders — xem ghi chú ở `sortBy` bên dưới. */
export const ORDER_SORT_FIELDS = [
  'createdAt', 'updatedAt', 'code', 'status', 'desiredDate', 'closedAt', 'completedAt',
] as const;

export class OrderFilterDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional() @IsIn(Object.values(OrderStatus))
  status?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  serviceId?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  assigneeId?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  customerId?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  createdBy?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  originProvince?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  destinationProvince?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ enum: ['created', 'closed', 'completed'], default: 'created' })
  @IsOptional() @IsIn(['created', 'closed', 'completed'])
  dateField?: 'created' | 'closed' | 'completed';

  @ApiPropertyOptional({ description: 'Mã đơn hoặc tên khách' })
  @IsOptional() @IsString()
  q?: string;

  /**
   * Lọc theo TRƯỜNG RIÊNG của dịch vụ, dạng `khóa:giá trị` (lặp lại được):
   * `?serviceId=3&sf=declaration_type:Nhập kinh doanh&sf=docs_ready:true`.
   *
   * Giá trị được so với MỌI cách đọc hợp lệ của chuỗi đó — chuỗi, và thêm số hoặc
   * boolean nếu đọc được. Nhờ vậy mã HS "9999.99" (kiểu text) và số tờ khai 2 (kiểu
   * number) đều khớp mà không cần client khai kiểu.
   */
  @ApiPropertyOptional({
    type: [String],
    example: ['declaration_type:Nhập kinh doanh'],
    description: 'Lọc theo trường riêng của dịch vụ, dạng khóa:giá trị',
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9_]{0,49}:.{1,200}$/, {
    each: true,
    message: 'Bộ lọc trường riêng phải có dạng khóa:giá trị',
  })
  sf?: string[];

  /**
   * QA-29: `sortBy` của PaginationDto chỉ là @IsString, mà list() đưa thẳng vào
   * `orderBy` của Prisma — một tên cột không tồn tại làm Prisma ném lỗi và API trả
   * 500 cho một tham số mà Swagger vẫn khai là hợp lệ. Chốt danh sách cột cho phép
   * để giá trị sai trả 400 kèm lời giải thích.
   *
   * `finalAmount` CỐ Ý không có mặt: người không được xem tiền vẫn suy ra được thứ
   * tự giá trị nếu sắp xếp theo cột đó, trong khi API đã dày công trả về null.
   */
  @ApiPropertyOptional({
    enum: ORDER_SORT_FIELDS,
    default: 'createdAt',
    description: 'Cột sắp xếp; giá trị ngoài danh sách trả 400',
  })
  @IsOptional() @IsIn(ORDER_SORT_FIELDS)
  declare sortBy?: (typeof ORDER_SORT_FIELDS)[number];
}
