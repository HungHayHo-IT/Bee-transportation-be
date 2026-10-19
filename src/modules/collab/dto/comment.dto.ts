import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedDto } from '@/common/dto/pagination.dto';

export class CreateCommentDto {
  @ApiProperty() @IsString() @MaxLength(5000)
  body!: string;

  @ApiPropertyOptional({ description: 'Luồng của phòng nào. Bỏ trống = luồng chung' })
  @IsOptional() @Type(() => Number) @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ type: [Number], description: '@mention — chỉ người xem được luồng' })
  @IsOptional() @IsArray() @ArrayUnique() @Type(() => Number) @IsInt({ each: true })
  mentions?: number[];
}

/** Một người có thể @mention trong luồng đang viết. */
export class MentionableUserDto {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
}

/** Vỏ phân trang — danh sách người @mention được chỉ trong một đơn, luôn nhỏ. */
export class MentionablePageDto extends PagedDto(MentionableUserDto) {}

export class CommentDto {
  @ApiProperty() id!: number;
  @ApiProperty({ description: 'comment | revision_request' }) kind!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: Number, nullable: true }) departmentId!: number | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty() authorId!: number;
  @ApiProperty() authorName!: string;
  @ApiProperty({ type: [Number] }) mentions!: number[];
  @ApiProperty() createdAt!: Date;
}

/** Vỏ phân trang — luồng bình luận của một đơn, sắp cũ tới mới. */
export class CommentPageDto extends PagedDto(CommentDto) {}

/**
 * QA-06: trước đây trả `by` (id trần) và `at`, trong khi mọi DTO khác dùng
 * `createdAt` và luôn kèm tên. Tên khóa lưu trong jsonb giữ nguyên, chỗ này chỉ là
 * lớp trình bày nên không phải nắn dữ liệu cũ.
 */
export class FileMetaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Tên file gốc lúc tải lên' }) name!: string;
  @ApiProperty() mime!: string;
  @ApiProperty({ description: 'Kích thước (byte)' }) size!: number;
  @ApiProperty() uploadedById!: number;
  @ApiProperty({ type: String, nullable: true }) uploadedByName!: string | null;
  @ApiProperty({ type: String, description: 'ISO 8601' }) createdAt!: string;
  @ApiProperty({
    type: Number, nullable: true,
    description: 'File gắn với mốc tiến độ nào; null là file của cả đơn',
  })
  milestoneId!: number | null;
}

/** Vỏ phân trang — file của một đơn, luôn nhỏ, trả trọn một trang. */
export class FileMetaPageDto extends PagedDto(FileMetaDto) {}
