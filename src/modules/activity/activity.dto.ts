import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PagedDto, PaginationDto } from '@/common/dto/pagination.dto';

/** Cột được phép sắp xếp trên /activity — xem ghi chú ở `sortBy` bên dưới. */
export const ACTIVITY_SORT_FIELDS = ['createdAt', 'id'] as const;

/**
 * QA-27: các bộ lọc dưới đây trước chỉ khai bằng `@ApiQuery` và nhận qua
 * `@Query('entity')`, trong khi cả object query lại được validate theo
 * `PaginationDto`. ValidationPipe chạy `forbidNonWhitelisted` nên mọi filter
 * đều bị trả 400 `property entity should not exist` — dù Swagger vẫn quảng cáo
 * chúng. Khai thành một DTO thừa kế `PaginationDto` là chỗ duy nhất sửa được
 * cả hai mặt cùng lúc: tài liệu và validation nay là một.
 */
export class ActivityQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Bảng bị tác động, ví dụ orders' })
  @IsOptional() @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Khóa của bản ghi, lưu dạng chuỗi' })
  @IsOptional() @IsString()
  entityId?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  actorId?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  orderId?: number;

  /**
   * QA-30: `PaginationDto` khai sortBy/sortOrder cho mọi DTO kế thừa nó, nhưng
   * controller trước đây cắm cứng `orderBy: { createdAt: 'desc' }` nên hai tham số
   * bị bỏ qua TRONG IM LẶNG — client xin asc vẫn nhận desc, không lỗi nào báo.
   *
   * Thu hẹp bằng danh sách trắng thay vì bỏ hai tham số đi: nhật ký xem theo thứ
   * tự cũ-trước là nhu cầu thật. Whitelist là bắt buộc — QA-29 đã cho thấy tên cột
   * tùy ý đi thẳng vào `orderBy` làm Prisma ném 500.
   */
  @ApiPropertyOptional({
    enum: ACTIVITY_SORT_FIELDS,
    default: 'createdAt',
    description: 'Cột sắp xếp; giá trị ngoài danh sách trả 400',
  })
  @IsOptional() @IsIn(ACTIVITY_SORT_FIELDS)
  declare sortBy?: (typeof ACTIVITY_SORT_FIELDS)[number];
}

export class ActivityItemDto {
  @ApiProperty() id!: number;
  // QA-06: trước tên là `at`, lệch với `createdAt` dùng ở mọi DTO khác nên
  // front-end render cột thời gian ra rỗng cho tới khi chạy thật.
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty() entity!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ type: Number, nullable: true }) actorId!: number | null;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) orderId!: number | null;
  @ApiProperty({ type: String, nullable: true }) orderCode!: string | null;
  @ApiProperty({
    type: 'object', additionalProperties: true, nullable: true,
    description: 'Dữ liệu kèm theo, hình dạng tùy action',
  })
  detail!: unknown;
}

/** Vỏ phân trang của /activity — khai tường minh cho Swagger. */
export class ActivityPageDto extends PagedDto(ActivityItemDto) {}
