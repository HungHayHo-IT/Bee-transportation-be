import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class TaoDieuKhoanDto {
  @ApiProperty({ example: 'Phạm vi dịch vụ' })
  @IsString() @IsNotEmpty() @MaxLength(300)
  title!: string;

  @ApiProperty({ description: 'Nội dung của điều, xuống dòng tự do' })
  @IsString() @IsNotEmpty() @MaxLength(20000)
  body!: string;
}

export class SuaDieuKhoanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20000)
  body?: string;

  @ApiPropertyOptional({ description: 'Nhỏ đứng trước' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  sortOrder?: number;

  /** Tắt chứ không xoá khi muốn ngừng dùng: xoá là mất bản đã soạn kỹ. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class DieuKhoanResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) updatedByName!: string | null;
}

export class ToanVanDieuKhoanDto {
  @ApiProperty({ description: 'Các điều đang bật ghép lại — đúng thứ khách sẽ ký' })
  toanVan!: string;
}
