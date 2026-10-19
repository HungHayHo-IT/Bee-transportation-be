import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, ArrayUnique, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString,
  MaxLength,
} from 'class-validator';
import { ALL_ROLES } from '@/common/enums';
import { PagedDto } from '@/common/dto/pagination.dto';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';

export class CreateUserDto {
  @ApiProperty() @TrimmedText() @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiProperty() @IsString() @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  departmentId?: number;

  @ApiProperty({ type: [String], enum: ALL_ROLES, example: ['sale'] })
  @ArrayNotEmpty({ message: 'Phải gán ít nhất một vai trò' })
  @ArrayUnique()
  @IsIn(ALL_ROLES, { each: true, message: 'Vai trò không hợp lệ' })
  roles!: string[];

  @ApiPropertyOptional({
    description: 'Mật khẩu tạm. Bỏ trống thì hệ thống tự sinh và trả về một lần.',
  })
  @IsOptional() @IsString() @MaxLength(256)
  tempPassword?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ type: [String], enum: ALL_ROLES })
  @IsOptional() @ArrayUnique() @IsIn(ALL_ROLES, { each: true })
  roles?: string[];

  @ApiPropertyOptional({ description: 'Cờ cấp lẻ "Xem báo cáo công ty"' })
  @IsOptional() @IsBoolean()
  canViewCompanyReport?: boolean;

  @ApiPropertyOptional({ description: 'Cờ cấp lẻ "Xem toàn bộ đơn (chỉ xem)" — cho người báo giá' })
  @IsOptional() @IsBoolean()
  canViewAllOrders?: boolean;
}

export class SetStatusDto {
  @ApiProperty() @IsBoolean()
  isActive!: boolean;
}

export class UserResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: Number, nullable: true }) departmentId!: number | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() canViewCompanyReport!: boolean;
  @ApiProperty() canViewAllOrders!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
  @ApiProperty() isActive!: boolean;
}

export class TempPasswordResponseDto {
  @ApiProperty({ description: 'Chỉ trả về một lần duy nhất' }) tempPassword!: string;
}

export class UserPageDto extends PagedDto(UserResponseDto) {}
