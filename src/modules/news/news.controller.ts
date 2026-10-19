import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param,
  ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { clamp, MAX_PAGE } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateNewsArticleDto, NewsArticleDto, NewsPageDto, NEWS_STATUSES,
  PublicNewsDetailDto, PublicNewsPageDto, UpdateNewsArticleDto,
} from './dto/news.dto';
import { NewsS3Service, PresignedUpload } from './news-s3.service';
import { NewsService } from './news.service';

@ApiTags('News')
@Controller()
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('news')
export class NewsController {
  constructor(
    private readonly news: NewsService,
    private readonly s3: NewsS3Service,
  ) {}

  /* ------------------------------------------------------------------ Admin CRUD */

  @Post('news')
  @ApiOperation({ summary: 'Tạo bài tin tức (Admin)' })
  @ApiResponse({ status: 201, type: NewsArticleDto })
  create(
    @Body() dto: CreateNewsArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NewsArticleDto> {
    return this.news.createArticle(dto, user);
  }

  @Get('news')
  @ApiOperation({ summary: 'Danh sách tin tức (Admin — cả draft/archived)' })
  @ApiQuery({ name: 'status', required: false, enum: NEWS_STATUSES })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: NewsPageDto })
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<NewsPageDto> {
    return this.news.list(status, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
  }

  @Get('news/:id')
  @ApiOperation({ summary: 'Chi tiết một bài tin tức (Admin)' })
  @ApiResponse({ status: 200, type: NewsArticleDto })
  detail(@Param('id', ParseIntPipe) id: number): Promise<NewsArticleDto> {
    return this.news.detail(id);
  }

  @Patch('news/:id')
  @ApiOperation({ summary: 'Sửa bài tin tức (Admin)' })
  @ApiResponse({ status: 200, type: NewsArticleDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNewsArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NewsArticleDto> {
    return this.news.update(id, dto, user);
  }

  @Delete('news/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá bài tin tức (Admin)' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.news.remove(id, user);
  }

  /* -------------------------------------------------------------- Ảnh nhúng */

  @Post('news/images/presign')
  @ApiOperation({
    summary: 'Xin presigned PUT URL để browser upload thẳng lên S3 (Admin)',
    description: 'FE gọi endpoint này, PUT file lên uploadUrl trả về, rồi lưu publicUrl vào bài.',
  })
  async presignImage(
    @Body() body: { filename?: string; contentType?: string },
  ): Promise<PresignedUpload> {
    if (!this.s3.isEnabled())
      throw new BadRequestException('S3 chưa cấu hình — kiểm tra biến S3_* trong .env');
    const name = (body?.filename ?? '').trim();
    const type = (body?.contentType ?? '').trim();
    if (!name || !type)
      throw new BadRequestException('Thiếu filename hoặc contentType');
    return this.s3.presignUpload(name, type);
  }

  /* --------------------------------------------------- Public endpoints (landing) */

  @Get('public/news')
  @Public()
  @ApiOperation({ summary: 'Danh sách tin tức đã published (public)' })
  @ApiResponse({ status: 200, type: PublicNewsPageDto })
  publicList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PublicNewsPageDto> {
    return this.news.publicList(clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
  }

  @Get('public/news/:slug')
  @Public()
  @ApiOperation({ summary: 'Chi tiết bài tin tức theo slug (public)' })
  @ApiResponse({ status: 200, type: PublicNewsDetailDto })
  publicDetail(@Param('slug') slug: string): Promise<PublicNewsDetailDto> {
    return this.news.publicDetail(slug);
  }
}
