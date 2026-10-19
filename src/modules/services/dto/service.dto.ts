import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max,
  MaxLength, Min,
} from 'class-validator';
import { CARGO_FIELD_KEYS } from '@/common/reference/cargo-fields';
import { PagedDto } from '@/common/dto/pagination.dto';

export class CreateServiceDto {
  @ApiProperty({ example: 'DOM', description: 'Tiền tố mã đơn, 3 chữ in hoa' })
  @IsString() @Matches(/^[A-Z]{3}$/, { message: 'Mã dịch vụ phải là 3 chữ cái in hoa' })
  code!: string;

  @ApiProperty() @IsString() @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ default: 24 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720)
  slaHours?: number;

  @ApiProperty({ type: [String], description: 'Bộ mốc theo thứ tự, mốc cuối là Nghiệm thu' })
  @ArrayNotEmpty({ message: 'Phải có ít nhất một mốc tiến độ' })
  @IsString({ each: true })
  milestones!: string[];
}

export class UpdateServiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(720)
  slaHours?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: CARGO_FIELD_KEYS,
    isArray: true,
    description:
      'Ô "Thông số hàng hóa" chung mà dịch vụ này dùng. Mảng rỗng = ẩn cả khối ' +
      '(tư vấn, cho thuê thiết bị không có lô hàng nào để đo).',
  })
  @IsOptional() @IsArray()
  @IsIn(CARGO_FIELD_KEYS as unknown as string[], {
    each: true,
    message: 'Thông số hàng hóa không hợp lệ',
  })
  cargoFields?: string[];
}

export class SetMilestonesDto {
  @ApiProperty({ type: [String], description: 'Ghi đè cả bộ, theo thứ tự' })
  @ArrayNotEmpty({ message: 'Phải có ít nhất một mốc tiến độ' })
  @IsString({ each: true })
  milestones!: string[];
}

/**
 * Tạo một dịch vụ HIỆN TRÊN LANDING.
 *
 * Tách khỏi CreateServiceDto thay vì thêm mấy trường tuỳ chọn vào đó: hai cửa
 * này khác nhau về cái gì bắt buộc. Tạo dịch vụ nội bộ thì phải khai bộ mốc
 * tiến độ, còn thêm dịch vụ từ màn nội dung thì người viết bài không biết mốc
 * tiến độ là gì — bộ mốc lấy mặc định, phòng vận hành chỉnh sau ở màn Dịch vụ.
 */
export class CreateLandingServiceDto {
  @ApiProperty({ description: 'Tên dịch vụ hiện trên trang' })
  @IsString() @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Mã 3 chữ in hoa, tiền tố mã đơn. Bỏ trống thì đoán từ tên.',
  })
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/, {
    message: 'Mã dịch vụ phải là 3 chữ cái in hoa',
  })
  code?: string;

  /**
   * Đường dẫn phải là thứ gõ được và không đụng trang nào sẵn có. Landing mới
   * là nơi biết đủ danh sách đường dẫn đang dùng, nên màn quản trị kiểm trước
   * theo danh mục landing gửi sang; ở đây chỉ chặn hình dạng và trùng nhau
   * giữa các dịch vụ tự thêm.
   */
  @ApiProperty({ example: 'van-chuyen-hang-lanh' })
  @IsString() @MaxLength(120) @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'Đường dẫn chỉ gồm chữ thường, số và gạch ngang',
  })
  slugVi!: string;

  @ApiProperty({ example: 'reefer-transport' })
  @IsString() @MaxLength(120) @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'Đường dẫn chỉ gồm chữ thường, số và gạch ngang',
  })
  slugEn!: string;

  @ApiPropertyOptional({ description: 'Một dòng tóm tắt, hiện trên thẻ dịch vụ' })
  @IsOptional() @IsString() @MaxLength(400)
  summary?: string;
}

/** Dịch vụ tự thêm, như landing cần biết để dựng trang. */
export class LandingServiceDto {
  @ApiProperty() id!: number;
  @ApiProperty({ description: 'Khoá ổn định, dùng làm khoá nội dung bên landing' })
  key!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ description: 'Tên mặc định; CMS sửa đè được theo từng ngôn ngữ' })
  name!: string;
  @ApiProperty() slugVi!: string;
  @ApiProperty() slugEn!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, nullable: true }) summary!: string | null;
}

/** Vỏ phân trang — danh mục nhỏ, trả trọn một trang. */
export class LandingServicePageDto extends PagedDto(LandingServiceDto) {}

export class ServiceResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slaHours!: number;
  @ApiProperty({ type: [String] }) milestones!: string[];
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [Number], description: 'Phòng ban phụ trách' }) departmentIds!: number[];

  @ApiProperty({
    type: String, nullable: true,
    description: 'Khoá landing. null = dịch vụ này không hiện trên trang giới thiệu.',
  })
  landingKey!: string | null;

  @ApiProperty({
    enum: CARGO_FIELD_KEYS,
    isArray: true,
    description: 'Ô "Thông số hàng hóa" chung mà dịch vụ này dùng',
  })
  cargoFields!: string[];
}

/** Vỏ phân trang — danh mục nhỏ nên luôn trả trọn một trang. */
export class ServicePageDto extends PagedDto(ServiceResponseDto) {}

/**
 * Bản rút gọn cho khách vãng lai: vừa đủ dựng form gửi yêu cầu báo giá.
 * Cố ý KHÔNG kế thừa ServiceResponseDto — DTO đầy đủ còn slaHours, milestones
 * và departmentIds, tức cam kết nội bộ, quy trình vận hành và sơ đồ phòng ban.
 * Tách hẳn hai lớp như vậy để sau này ai thêm trường vào DTO đầy đủ cũng không
 * vô tình đẩy nó ra ngoài: muốn công khai thì phải sửa thêm ở đây.
 */
/** Một dịch vụ con trong ô chọn của form công khai. */
export class PublicServiceChildDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;

  /**
   * Mã phương thức vận chuyển của OF1-TMS, ví dụ DOMESTIC_LCL.
   *
   * Gửi lên vẫn là `id` chứ không phải mã này — mã chỉ để bên gọi đối chiếu và
   * hiển thị. null = dịch vụ con chưa gắn mã, đơn của nó không đẩy sang TMS
   * được.
   */
  @ApiProperty({ type: String, nullable: true }) tmsMode!: string | null;
}

/**
 * Một ô trên form công khai, mô tả đủ để app tự dựng và tự kiểm.
 *
 * Mảng này là HỢP ĐỒNG với app: thêm một ô bắt buộc ở backend mà quên thêm
 * vào đây thì app gửi lên vẫn thiếu, và yêu cầu nằm im ở `pending` không ai
 * nhìn thấy. Nguồn của nó là chính luật mà backend đang chạy, không phải một
 * bản chép tay.
 */
export class PublicFormFieldDto {
  @ApiProperty({ description: 'Tên trường gửi lên POST /quote-requests' })
  key!: string;

  @ApiProperty() label!: string;

  @ApiProperty({
    enum: ['text', 'phone', 'email', 'province', 'select', 'textarea'],
    description: 'Kiểu ô để app dựng đúng bàn phím và bộ chọn',
  })
  type!: string;

  @ApiProperty({ description: 'true = thiếu thì yêu cầu không thành đơn được' })
  required!: boolean;

  @ApiProperty({
    type: [PublicServiceChildDto],
    description: 'Chỉ có với type = select. Giá trị gửi lên là `id`.',
  })
  options!: PublicServiceChildDto[];
}

export class PublicServiceResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;

  /** Khách cần để sắp danh sách đúng thứ tự admin đã xếp, không lộ gì nội bộ. */
  @ApiProperty() sortOrder!: number;

  @ApiProperty({
    enum: CARGO_FIELD_KEYS,
    isArray: true,
    description: 'Ô "Thông số hàng hóa" cần hiện trên form báo giá',
  })
  cargoFields!: string[];

  @ApiProperty({
    type: [PublicServiceChildDto],
    description:
      'Dịch vụ con đang bật. Mảng KHÔNG rỗng nghĩa là phải chọn một dòng — '
      + 'xem trường serviceChildId trong formFields.',
  })
  children!: PublicServiceChildDto[];

  @ApiProperty({
    type: [PublicFormFieldDto],
    description:
      'Các ô của form gửi yêu cầu báo giá, theo đúng thứ tự nên hiện. App dựng '
      + 'từ mảng này thay vì viết cứng, để thêm ô ở backend không cần phát hành '
      + 'lại app.',
  })
  formFields!: PublicFormFieldDto[];
}

export class PublicServicePageDto extends PagedDto(PublicServiceResponseDto) {}
