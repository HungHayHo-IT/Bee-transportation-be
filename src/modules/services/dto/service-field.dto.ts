import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min,
} from 'class-validator';
import { SERVICE_FIELD_TYPES } from '@/common/reference/cargo-fields';
import { PagedDto } from '@/common/dto/pagination.dto';

const KEY_RULE = /^[a-z][a-z0-9_]{0,49}$/;

export class CreateServiceFieldDto {
  @ApiProperty({
    example: 'declaration_type',
    description:
      'Khóa trong orders.serviceData. Chữ thường + gạch dưới. KHÔNG đổi được sau khi ' +
      'đã có đơn nhập giá trị cho trường này.',
  })
  @IsString()
  @Matches(KEY_RULE, {
    message: 'Khóa trường phải bắt đầu bằng chữ thường, chỉ gồm a-z, 0-9 và dấu gạch dưới',
  })
  fieldKey!: string;

  @ApiProperty({ example: 'Loại hình tờ khai' })
  @IsString() @MaxLength(200)
  label!: string;

  @ApiProperty({ enum: SERVICE_FIELD_TYPES })
  @IsIn(SERVICE_FIELD_TYPES as unknown as string[], { message: 'Kiểu trường không hợp lệ' })
  fieldType!: string;

  @ApiPropertyOptional({ example: 'tấn', description: 'Hiện bên trong ô nhập' })
  @IsOptional() @IsString() @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'BẮT BUỘC và chỉ dùng khi fieldType = select',
  })
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true })
  options?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ default: 0, description: 'Thứ tự hiển thị, nhỏ đứng trước' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Dòng gợi ý dưới ô nhập' })
  @IsOptional() @IsString() @MaxLength(300)
  helpText?: string;

  /**
   * Ô riêng của MỘT dịch vụ con. Bỏ trống = áp dụng cho cả dịch vụ.
   *
   * Dùng khi hình dạng form đổi theo dịch vụ con: đơn PRJ chọn "Xuyên biên
   * giới" cần ô Nước đến và Cửa khẩu, còn chọn "Xuất khẩu FCL" thì không.
   */
  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  serviceChildId?: number;
}

/**
 * `fieldKey` cố ý vắng mặt: đổi khóa là bỏ rơi toàn bộ giá trị đơn cũ đã lưu dưới
 * khóa đó. Muốn đổi thì tạo trường mới rồi tắt trường cũ.
 */
export class UpdateServiceFieldDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ enum: SERVICE_FIELD_TYPES })
  @IsOptional() @IsIn(SERVICE_FIELD_TYPES as unknown as string[])
  fieldType?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  unit?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true })
  options?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  helpText?: string;

  @ApiPropertyOptional({ description: 'false = ngừng dùng; đơn cũ vẫn giữ giá trị' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ServiceFieldResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() serviceId!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'null = ô chung của cả dịch vụ' })
  serviceChildId!: number | null;
  @ApiProperty() fieldKey!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: SERVICE_FIELD_TYPES }) fieldType!: string;
  @ApiProperty({ type: String, nullable: true }) unit!: string | null;
  @ApiProperty({ type: [String] }) options!: string[];
  @ApiProperty() isRequired!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, nullable: true }) helpText!: string | null;
  @ApiProperty() isActive!: boolean;
}

/** Tất cả những gì form tạo đơn cần biết về một dịch vụ. */
export class ServiceFormSchemaDto {
  @ApiProperty() serviceId!: number;
  @ApiProperty() serviceCode!: string;

  @ApiProperty({
    type: [String],
    description: 'Ô "Thông số hàng hóa" chung mà dịch vụ này dùng; mảng rỗng = ẩn cả khối',
  })
  cargoFields!: string[];

  @ApiProperty({
    description:
      'false = điểm ĐI nằm ngoài nước nên KHÔNG hỏi tỉnh/thành điểm đi (hàng nhập '
      + 'khẩu). Đã tính theo dịch vụ con nếu truyền serviceChildId.',
  })
  hasDomesticOrigin!: boolean;

  @ApiProperty({
    description:
      'false = điểm ĐẾN nằm ngoài nước nên KHÔNG hỏi tỉnh/thành điểm đến (hàng xuất '
      + 'khẩu, xuyên biên giới). Backend cũng bỏ qua ô này khi chấm đơn đã đủ thông '
      + 'tin chưa — hai bên đọc cùng một cờ.',
  })
  hasDomesticDestination!: boolean;

  @ApiProperty({ type: [ServiceFieldResponseDto], description: 'Chỉ trường đang hoạt động' })
  fields!: ServiceFieldResponseDto[];
}

export class ServiceFieldPageDto extends PagedDto(ServiceFieldResponseDto) {}
