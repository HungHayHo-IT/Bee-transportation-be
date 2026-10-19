import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength,
} from 'class-validator';
import { PagedDto } from '@/common/dto/pagination.dto';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const NEWS_STATUSES = ['draft', 'published', 'archived'] as const;

export class CreateNewsArticleDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(240)
  title!: string;

  @ApiProperty({ description: 'Slug URL. Chỉ chữ thường, số, gạch nối.' })
  @IsString() @MinLength(3) @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: 'Slug không hợp lệ (chỉ chữ thường, số, gạch nối)' })
  slug!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100000)
  body?: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_protocol: true })
  coverImageUrl?: string;

  @ApiPropertyOptional({ enum: NEWS_STATUSES })
  @IsOptional() @IsIn(NEWS_STATUSES)
  status?: (typeof NEWS_STATUSES)[number];
}

export class UpdateNewsArticleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(240)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: 'Slug không hợp lệ' })
  slug?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100000)
  body?: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl({ require_protocol: true })
  coverImageUrl?: string;

  @ApiPropertyOptional({ enum: NEWS_STATUSES })
  @IsOptional() @IsIn(NEWS_STATUSES)
  status?: (typeof NEWS_STATUSES)[number];
}

/** Bản đầy đủ — Admin đọc, cả draft/archived. */
export class NewsArticleDto {
  @ApiProperty() id!: number;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) excerpt!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, nullable: true }) coverImageUrl!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) createdById!: number | null;
  @ApiProperty({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

/** Bản public — bỏ body, dành cho list ngoài landing. */
export class PublicNewsSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) excerpt!: string | null;
  @ApiProperty({ type: String, nullable: true }) coverImageUrl!: string | null;
  @ApiProperty() publishedAt!: string;
}

/** Bản public detail — có body. */
export class PublicNewsDetailDto extends PublicNewsSummaryDto {
  @ApiProperty() body!: string;
}

export class NewsPageDto extends PagedDto(NewsArticleDto) {}

export class PublicNewsPageDto extends PagedDto(PublicNewsSummaryDto) {}
