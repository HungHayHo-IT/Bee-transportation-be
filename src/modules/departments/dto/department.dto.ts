import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedDto } from '@/common/dto/pagination.dto';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Phòng Vận chuyển nội địa' })
  @IsString() @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Trưởng phòng' })
  @IsOptional() @Type(() => Number) @IsInt()
  managerId?: number;

  @ApiPropertyOptional({ description: 'Phòng cha trong sơ đồ tổ chức; bỏ trống là một gốc' })
  @IsOptional() @Type(() => Number) @IsInt()
  parentId?: number | null;

  @ApiPropertyOptional({ type: [Number], description: 'Dịch vụ phòng phụ trách (ma trận định tuyến F2)' })
  @IsOptional() @IsArray() @ArrayUnique() @Type(() => Number) @IsInt({ each: true })
  serviceIds?: number[];
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @Type(() => Number) @IsInt()
  managerId?: number;

  @ApiPropertyOptional({ description: 'Phòng cha trong sơ đồ tổ chức; bỏ trống là một gốc' })
  @IsOptional() @Type(() => Number) @IsInt()
  parentId?: number | null;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class SetServicesDto {
  @ApiProperty({ type: [Number], description: 'Ghi đè cả mảng, không patch từng phần tử' })
  @IsArray() @ArrayUnique() @Type(() => Number) @IsInt({ each: true })
  serviceIds!: number[];

  /** Phòng Sale: không tham gia báo giá — serviceIds bị bỏ qua, lưu thành rỗng. Bỏ trống = giữ nguyên. */
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isSales?: boolean;

  /** Phòng báo giá (079): duy nhất phòng nhận đơn và báo giá. Bỏ trống = giữ nguyên. */
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isQuoting?: boolean;
}

export class DepartmentResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true }) managerId!: number | null;
  @ApiProperty({ type: String, nullable: true }) managerName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) parentId!: number | null;
  @ApiProperty({ type: [Number] }) serviceIds!: number[];
  @ApiProperty() isActive!: boolean;
  /** Phòng kinh doanh — không tham gia báo giá (076). */
  @ApiProperty() isSales!: boolean;
  /** Phòng báo giá (079). */
  @ApiProperty() isQuoting!: boolean;
  @ApiProperty() memberCount!: number;
}

/** Vỏ phân trang — danh mục nhỏ nên luôn trả trọn một trang. */
export class DepartmentPageDto extends PagedDto(DepartmentResponseDto) {}

export class DepartmentMemberDto {
  @ApiProperty() id!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
}

/** Nút của sơ đồ tổ chức. `children` tự tham chiếu nên Swagger phải khai báo tay. */
export class DepartmentTreeNodeDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true }) parentId!: number | null;
  @ApiProperty({ type: Number, nullable: true }) managerId!: number | null;
  @ApiProperty({ type: String, nullable: true }) managerName!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isSales!: boolean;
  @ApiProperty({ type: [DepartmentMemberDto] }) members!: DepartmentMemberDto[];
  @ApiProperty({ type: [DepartmentTreeNodeDto] }) children!: DepartmentTreeNodeDto[];
}

/** Vỏ phân trang cho sơ đồ tổ chức — trả trọn một trang, không phân trang thật. */
export class DepartmentTreePageDto extends PagedDto(DepartmentTreeNodeDto) {}
