import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';
import { PagedDto } from '@/common/dto/pagination.dto';

/** numeric(15,0) -> tối đa 999.999.999.999.999. Không chặn ở DTO thì DB ném 500. */
export const MAX_AMOUNT = 999_999_999_999_999;

export class AssignDto {
  @ApiProperty() @Type(() => Number) @IsInt()
  assigneeId!: number;
}

export class PassDto {
  @ApiProperty({ description: 'Bắt buộc — sale cần biết vì sao phòng không tham gia' })
  @TrimmedText() @IsString() @IsNotEmpty({ message: 'Bỏ qua đơn phải kèm lý do' })
  @MaxLength(500)
  reason!: string;
}

export class QuoteDto {
  @ApiProperty({ example: 45000000, description: 'Giá trị đơn hàng (VND)' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Giá trị đơn hàng phải lớn hơn 0' })
  @Max(MAX_AMOUNT, { message: 'Giá trị đơn hàng vượt giới hạn cho phép' })
  amount!: number;

  @ApiPropertyOptional({ example: 'Bao gồm bốc xếp 2 đầu, chưa gồm VAT' })
  @IsOptional() @IsString() @MaxLength(1000)
  scopeNote?: string;

  @ApiPropertyOptional({ example: '3 ngày kể từ khi nhận hàng' })
  @IsOptional() @IsString() @MaxLength(200)
  leadTime?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  validUntil?: string;
}

export class SelectQuoteDto {
  @ApiProperty() @Type(() => Number) @IsInt()
  departmentId!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

/** Giá Sale chốt với khách (mọi đơn đã chọn phòng thắng). Không thấp hơn giá phòng thắng — kiểm ở service. */
export class SetSalePriceDto {
  @ApiProperty({ example: 18_000_000 }) @Type(() => Number) @IsInt() @Min(1) @Max(MAX_AMOUNT)
  salePrice!: number;
}

export class RequestRevisionDto {
  @ApiProperty({ type: [Number] })
  @ArrayNotEmpty({ message: 'Phải chọn ít nhất một phòng ban' })
  @Type(() => Number) @IsInt({ each: true })
  departmentIds!: number[];

  @ApiProperty() @TrimmedText() @IsString()
  @IsNotEmpty({ message: 'Yêu cầu điều chỉnh phải kèm lý do' })
  @MaxLength(1000)
  reason!: string;
}

export class AddDepartmentDto {
  @ApiProperty() @Type(() => Number) @IsInt()
  departmentId!: number;
}

export class TransferDto {
  @ApiProperty({ description: 'Phòng nhận đơn' })
  @Type(() => Number) @IsInt()
  toDepartmentId!: number;

  @ApiProperty({ description: 'Vì sao chuyển — bắt buộc, sẽ hiện trong nhật ký đơn' })
  @TrimmedText() @IsString() @IsNotEmpty({ message: 'Chuyển đơn phải kèm lý do' })
  @MaxLength(500)
  reason!: string;
}

export class ReferencePriceDto {
  @ApiProperty() code!: string;
  @ApiProperty() finalAmount!: number;
  @ApiProperty() closedAt!: Date;
  @ApiProperty({ type: String, nullable: true }) originProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) destinationProvince!: string | null;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty({ type: Number, nullable: true }) volumeCbm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) packageCount!: number | null;
  @ApiProperty({ type: String, nullable: true }) containerType!: string | null;
  @ApiProperty({ description: 'Càng cao càng giống đơn đang báo giá; tối đa 8' })
  matchScore!: number;
}

/** Vỏ phân trang — luôn tối đa 5 đơn tham chiếu, trả trọn một trang. */
export class ReferencePricePageDto extends PagedDto(ReferencePriceDto) {}

/** Một bản báo giá đã bị ghi đè, đọc ra từ order_departments.quote_history. */
export class QuoteHistoryEntryDto {
  @ApiProperty({ description: 'Số phiên bản, 1 là bản đầu tiên' }) version!: number;
  @ApiProperty({ type: Number, nullable: true }) amount!: number | null;
  @ApiProperty({ type: String, nullable: true }) scopeNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) leadTime!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'YYYY-MM-DD' })
  validUntil!: string | null;
  @ApiProperty({ type: Number, nullable: true }) sentById!: number | null;
  @ApiProperty({ type: String, nullable: true }) sentByName!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Thời điểm gửi bản này' })
  at!: string | null;
}

export class QuoteHistoryDto {
  @ApiProperty() departmentId!: number;
  @ApiProperty() departmentName!: string;
  @ApiProperty({ description: 'Số phiên bản đang hiệu lực' }) currentVersion!: number;
  @ApiProperty({ type: [QuoteHistoryEntryDto], description: 'Cũ nhất trước' })
  history!: QuoteHistoryEntryDto[];
}

export class QueueItemDto {
  @ApiProperty() orderId!: number;
  @ApiProperty() code!: string;
  @ApiProperty() serviceName!: string;
  // Q-14: danh sách chỉ có mã đơn thì phải mở từng đơn mới biết của ai, đi đâu.
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty({ type: String, nullable: true }) originProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) destinationProvince!: string | null;
  @ApiProperty() state!: string;
  // Trạng thái của ĐƠN, khác trạng thái của phòng: đơn hủy/chốt rồi thì phòng không
  // thao tác được nữa dù state vẫn là pending.
  @ApiProperty({ description: 'Trạng thái đơn — phòng ban chỉ thao tác được khi còn DEPT_WORKABLE' })
  orderStatus!: string;
  @ApiProperty({ type: String, nullable: true }) assigneeName!: string | null;
  /** Người đang phụ trách nhập báo giá — chỉ người này gửi được báo giá. */
  @ApiProperty({ type: Number, nullable: true }) assigneeId!: number | null;
  @ApiProperty() distributedAt!: Date;
  @ApiProperty({ description: 'Quá hạn SLA tiếp nhận' }) slaLate!: boolean;
  @ApiProperty({ type: [Number], description: 'Các phòng đã tham gia đơn — hộp thoại chuyển đơn loại chúng ra' })
  participatingDeptIds!: number[];
}

/** Hàng đợi của một phòng — trả trọn một trang, tối đa 200 dòng. */
export class QueuePageDto extends PagedDto(QueueItemDto) {}
