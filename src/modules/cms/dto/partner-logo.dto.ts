import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max,
  MaxLength, Min,
} from 'class-validator';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';

export const NHOM_LOGO = ['customer', 'membership'] as const;
export type NhomLogo = (typeof NHOM_LOGO)[number];

export class CreatePartnerLogoDto {
  @ApiProperty({ enum: NHOM_LOGO })
  @IsIn(NHOM_LOGO)
  group!: NhomLogo;

  @ApiProperty() @TrimmedText() @IsString() @MaxLength(200)
  name!: string;

  @ApiProperty({ description: "URL S3 vừa tải lên, hoặc '/img/logos/...' có sẵn trong landing" })
  @IsString() @MaxLength(1000)
  imageUrl!: string;

  @ApiProperty({ description: 'Rộng/cao của ảnh — CMS đo bằng trình duyệt lúc tải lên' })
  @Type(() => Number) @IsNumber() @Min(0.05) @Max(50)
  ratio!: number;
}

export class UpdatePartnerLogoDto {
  @ApiPropertyOptional() @IsOptional() @TrimmedText() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ReorderPartnerLogosDto {
  @ApiProperty({ enum: NHOM_LOGO })
  @IsIn(NHOM_LOGO)
  group!: NhomLogo;

  @ApiProperty({ type: [Number], description: 'MỌI id của nhóm, theo thứ tự mới — đầu mảng là đầu dải' })
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsInt({ each: true })
  ids!: number[];
}

export class PartnerLogoDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: NHOM_LOGO }) group!: NhomLogo;
  @ApiProperty() name!: string;
  @ApiProperty() imageUrl!: string;
  @ApiProperty() ratio!: number;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
}
