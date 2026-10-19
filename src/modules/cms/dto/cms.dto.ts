import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsString, MaxLength, ValidateIf, ValidateNested,
} from 'class-validator';

/** Hai ngôn ngữ landing phục vụ. Trùng với ràng buộc CHECK của bảng. */
export const CMS_LOCALES = ['vi-vn', 'en-us'] as const;
export type CmsLocale = (typeof CMS_LOCALES)[number];

/**
 * Trần độ dài một ô nội dung.
 *
 * Rộng tay vì hai trang pháp lý (chính sách bảo mật, điều khoản dịch vụ) là
 * những đoạn văn dài thật, không phải nhãn nút. Nhưng vẫn phải có trần: cột
 * text của Postgres không giới hạn, và một ô 50MB dán nhầm sẽ đi thẳng vào
 * mọi lần render landing.
 */
export const MAX_VALUE_LENGTH = 20_000;

export class ContentEntryDto {
  @ApiProperty({ example: 'hero.title' })
  @IsString()
  @MaxLength(200)
  keyPath!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Giá trị ghi đè. Chuỗi rỗng là một lựa chọn hợp lệ (ẩn một dòng chữ). ' +
      '`null` = khôi phục bản mặc định trong code (xoá dòng ghi đè) — cùng ' +
      'transaction với các ô khác, để màn CMS giữ "Khôi phục" trong bản nháp.',
  })
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MAX_VALUE_LENGTH)
  value!: string | null;
}

export class SaveContentDto {
  @ApiProperty({ enum: CMS_LOCALES })
  @IsIn(CMS_LOCALES)
  locale!: CmsLocale;

  @ApiProperty({ type: [ContentEntryDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Không có ô nào để lưu' })
  // Một lần lưu là một section, không phải cả từ điển. Trần này chặn việc ai đó
  // bắn nguyên 690 ô lên trong một request rồi giữ khoá bảng suốt lượt ghi.
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ContentEntryDto)
  entries!: ContentEntryDto[];
}

export class ContentValueDto {
  @ApiProperty() keyPath!: string;
  @ApiProperty() value!: string;
  @ApiPropertyOptional({ nullable: true }) updatedBy!: string | null;
  @ApiProperty() updatedAt!: string;
}

export class PresignImageDto {
  @ApiProperty({ example: 'hero-banner.jpg' })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(100)
  contentType!: string;
}
