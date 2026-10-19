import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NewsS3Service, PresignedUpload } from '../news/news-s3.service';
import { CmsService } from './cms.service';
import {
  CMS_LOCALES, CmsLocale, ContentValueDto, PresignImageDto, SaveContentDto,
} from './dto/cms.dto';

/** Ngôn ngữ lạ thì rơi về tiếng Việt thay vì ném lỗi — xem giải thích ở publicMap. */
function chuanHoaLocale(raw?: string): CmsLocale {
  return (CMS_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as CmsLocale)
    : 'vi-vn';
}

@ApiTags('CMS landing')
@Controller()
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('cms')
export class CmsController {
  constructor(
    private readonly cms: CmsService,
    private readonly s3: NewsS3Service,
  ) {}

  /**
   * Cửa landing gọi mỗi lần dựng lại trang.
   *
   * @Public vì landing gọi lúc build và lúc revalidate, không có người đăng
   * nhập nào ở đó. Nội dung trả về vốn đã công khai — nó chính là chữ in trên
   * trang chủ — nên không có gì để giấu.
   *
   * Ngôn ngữ lạ rơi về tiếng Việt thay vì 400: cửa này nằm trên đường dựng
   * trang, ném lỗi ở đây là landing mất nội dung vì một tham số gõ sai.
   */
  @Get('landing/content')
  @Public()
  @ApiOperation({
    summary: 'Lớp phủ nội dung landing (công khai)',
    description:
      'Map phẳng khoá → giá trị của những ô ĐÃ bị sửa. Khoá không có trong map ' +
      'nghĩa là landing dùng giá trị mặc định biên dịch sẵn trong code.',
  })
  @ApiQuery({ name: 'locale', required: false, enum: CMS_LOCALES })
  publicMap(@Query('locale') locale?: string): Promise<Record<string, string>> {
    return this.cms.publicMap(chuanHoaLocale(locale));
  }

  /* --------------------------------------------------------------- Quản trị */

  @Get('cms/schema')
  @ApiOperation({
    summary: 'Danh mục ô nội dung sửa được, kèm giá trị mặc định',
    description:
      'Lấy hộ từ landing để admin chỉ phải nói chuyện với BeeOps. Nhớ tạm 60 giây.',
  })
  @ApiQuery({ name: 'locale', required: false, enum: CMS_LOCALES })
  schema(@Query('locale') locale?: string): Promise<unknown> {
    return this.cms.schema(chuanHoaLocale(locale));
  }

  @Get('cms/content')
  @ApiOperation({ summary: 'Danh sách ô đã ghi đè, kèm ai sửa và sửa lúc nào' })
  @ApiQuery({ name: 'locale', required: false, enum: CMS_LOCALES })
  @ApiResponse({ status: 200, type: [ContentValueDto] })
  adminList(@Query('locale') locale?: string): Promise<ContentValueDto[]> {
    return this.cms.adminList(chuanHoaLocale(locale));
  }

  @Put('cms/content')
  @ApiOperation({
    summary: 'Lưu một loạt ô đã sửa',
    description: 'Ghi đè hoặc tạo mới. Băng CTA bị từ chối ở tầng dữ liệu.',
  })
  async save(
    @Body() dto: SaveContentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ saved: number }> {
    return { saved: await this.cms.save(dto, user) };
  }

  @Delete('cms/content/:locale/:keyPath')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khôi phục một ô về bản mặc định trong code',
    description: 'Xoá dòng ghi đè. Ô chưa từng bị sửa thì trả removed=false.',
  })
  async reset(
    @Param('locale') locale: string,
    @Param('keyPath') keyPath: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ removed: boolean }> {
    return { removed: await this.cms.reset(chuanHoaLocale(locale), keyPath, user) };
  }

  @Post('cms/images/presign')
  @ApiOperation({
    summary: 'Xin presigned PUT URL để trình duyệt tải ảnh thẳng lên S3',
    description: 'Ảnh CMS nằm dưới tiền tố cms/, tách khỏi ảnh bài viết.',
  })
  presignImage(@Body() dto: PresignImageDto): Promise<PresignedUpload> {
    return this.s3.presignUpload(dto.filename, dto.contentType, 'cms');
  }
}
