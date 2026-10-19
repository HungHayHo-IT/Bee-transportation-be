import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { PagedDto } from '@/common/dto/pagination.dto';
import { TMS_MODES } from '@/common/reference/tms-modes';

export class CreateServiceChildDto {
  @ApiProperty({ example: 'Nội địa - hàng lẻ' })
  @IsString() @MaxLength(200)
  name!: string;

  /* `null` là một GIÁ TRỊ hợp lệ ở đây, không phải "bỏ trống": màn quản trị có
     hẳn một lựa chọn "Chưa có mã". Nên @IsOptional() để trường vắng mặt cũng
     qua, còn null thì lọt qua @IsIn nhờ nằm trong danh sách. */
  @ApiPropertyOptional({
    enum: TMS_MODES,
    nullable: true,
    description: 'Mã phương thức vận chuyển của OF1-TMS. null = chưa có mã.',
  })
  @IsOptional()
  @IsIn([...TMS_MODES, null], { message: 'Mã TMS không nằm trong danh sách OF1 cho phép' })
  tmsMode?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;
}

export class UpdateServiceChildDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: TMS_MODES, nullable: true })
  @IsOptional()
  @IsIn([...TMS_MODES, null], { message: 'Mã TMS không nằm trong danh sách OF1 cho phép' })
  tmsMode?: string | null;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ServiceChildResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() serviceId!: number;
  @ApiProperty() name!: string;

  @ApiProperty({
    type: String, nullable: true,
    description: 'null = chưa có mã. Đơn của dịch vụ con này KHÔNG đẩy sang TMS được.',
  })
  tmsMode!: string | null;

  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;

  @ApiProperty({
    description: 'Số đơn đang dùng dịch vụ con này. > 0 thì không xoá được, chỉ tắt.',
  })
  orderCount!: number;
}

export class ServiceChildPageDto extends PagedDto(ServiceChildResponseDto) {}
