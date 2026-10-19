import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsOptional, IsString, IsUrl, MaxLength, ValidateIf,
} from 'class-validator';
import { PagedDto } from '@/common/dto/pagination.dto';

export class RepresentativeUserDto {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() isLandingRepresentative!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Mô tả ngắn hiện trên landing' })
  landingDescription!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'URL ảnh đại diện. null = chưa có.' })
  landingAvatarUrl!: string | null;
}

export class DepartmentRepresentativeGroupDto {
  @ApiProperty({ type: Number, nullable: true }) departmentId!: number | null;
  @ApiProperty() departmentName!: string;
  @ApiProperty({ type: [RepresentativeUserDto] }) users!: RepresentativeUserDto[];
}

/** Vỏ phân trang — danh sách nhân viên nhóm theo phòng ban, trả trọn một trang. */
export class DepartmentRepresentativeGroupPageDto extends PagedDto(DepartmentRepresentativeGroupDto) {}

export class ToggleRepresentativeDto {
  @ApiPropertyOptional({ description: 'Bỏ trống thì giữ nguyên trạng thái hiện tại' })
  @IsOptional() @IsBoolean()
  isLandingRepresentative?: boolean;

  /**
   * Mô tả ngắn hiện dưới tên trên landing.
   *
   * Không bắt buộc, và gửi chuỗi rỗng là XOÁ mô tả. Giới hạn 280 ký tự: đây
   * là một dòng giới thiệu dưới tên, không phải tiểu sử — dài hơn thì thẻ
   * người đại diện trên landing cao gấp ba những thẻ bên cạnh.
   */
  @ApiPropertyOptional({ maxLength: 280 })
  @IsOptional() @IsString() @MaxLength(280)
  landingDescription?: string;

  /**
   * URL ảnh đại diện, hoặc chuỗi rỗng để GỠ ảnh.
   *
   * Nhận URL chứ không nhận byte: ảnh đã nằm trên S3 do trình duyệt tự tải lên
   * bằng URL ký sẵn, backend chỉ ghi lại địa chỉ.
   *
   * `ValidateIf` cho chuỗi rỗng đi qua @IsUrl — không có nó thì gỡ ảnh là
   * chuyện không làm được, vì mọi giá trị "không có ảnh" đều trượt validator.
   */
  @ApiPropertyOptional({ description: 'URL ảnh; chuỗi rỗng = gỡ ảnh' })
  @IsOptional() @IsString() @MaxLength(2048)
  @ValidateIf((o: ToggleRepresentativeDto) => (o.landingAvatarUrl ?? '') !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true },
    { message: 'landingAvatarUrl phải là URL http(s) hợp lệ' })
  landingAvatarUrl?: string;
}

export class LandingRepresentativeDto {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: String, nullable: true, description: 'Mô tả ngắn. null = chưa viết.' })
  description!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'URL ảnh. null = chưa có ảnh.' })
  avatarUrl!: string | null;
}

/** Vỏ phân trang — người đại diện hiển thị trên landing, trả trọn một trang. */
export class LandingRepresentativePageDto extends PagedDto(LandingRepresentativeDto) {}
