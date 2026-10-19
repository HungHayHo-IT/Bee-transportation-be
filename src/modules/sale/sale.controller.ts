import {
  BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { onePage, PageResult } from '@/common/dto/pagination.dto';
import {
  DepartmentRepresentativeGroupDto, DepartmentRepresentativeGroupPageDto, LandingRepresentativeDto,
  LandingRepresentativePageDto, RepresentativeUserDto, ToggleRepresentativeDto,
} from './dto/sale.dto';
import { NewsS3Service, PresignedUpload } from '../news/news-s3.service';
import { PresignImageDto } from '../cms/dto/cms.dto';
import { SaleService } from './sale.service';

@ApiTags('Sale — Người đại diện')
@Controller()
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('saleRepresentatives')
export class SaleController {
  constructor(
    private readonly saleService: SaleService,
    private readonly s3: NewsS3Service,
  ) {}

  @Get('sale/representatives')
  @ApiOperation({ summary: 'Danh sách nhân viên nhóm theo phòng ban (Admin)' })
  @ApiResponse({ status: 200, type: DepartmentRepresentativeGroupPageDto })
  async list(): Promise<PageResult<DepartmentRepresentativeGroupDto>> {
    return onePage(await this.saleService.listGrouped());
  }

  @Patch('sale/representatives/:userId')
  @ApiOperation({
    summary: 'Bật/tắt hiển thị và sửa mô tả người đại diện (Admin)',
    description: 'Trường nào không gửi thì giữ nguyên. Mô tả rỗng = xoá mô tả.',
  })
  @ApiResponse({ status: 200, type: RepresentativeUserDto })
  toggle(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ToggleRepresentativeDto,
  ): Promise<RepresentativeUserDto> {
    return this.saleService.toggle(
      userId, dto.isLandingRepresentative, dto.landingDescription, dto.landingAvatarUrl,
    );
  }

  /**
   * Xin URL ký sẵn để trình duyệt tải ảnh đại diện thẳng lên S3.
   *
   * Dùng lại đúng service đang ký ảnh bài viết và ảnh CMS — cùng bucket, cùng
   * danh sách MIME cho phép. Tiền tố riêng `dai-dien/` vì vòng đời khác: ảnh
   * người đại diện sống theo nhân sự, không theo bài viết.
   */
  @Post('sale/representatives/images/presign')
  @ApiOperation({ summary: 'Xin URL ký sẵn để tải ảnh người đại diện (Admin)' })
  presignAvatar(@Body() dto: PresignImageDto): Promise<PresignedUpload> {
    if (!this.s3.isEnabled())
      throw new BadRequestException('S3 chưa cấu hình — kiểm tra biến S3_* trong .env');
    return this.s3.presignUpload(dto.filename, dto.contentType, 'dai-dien');
  }

  // Public: trang landing khong yeu cau dang nhap; ai vao cung thay danh sach.
  @Get('landing/representatives')
  @Public()
  @ApiOperation({ summary: 'Người đại diện hiển thị trên trang landing (public)' })
  @ApiResponse({ status: 200, type: LandingRepresentativePageDto })
  async landing(): Promise<PageResult<LandingRepresentativeDto>> {
    return onePage(await this.saleService.landingList());
  }

  @Get('landing/representatives/:userId')
  @Public()
  @ApiOperation({ summary: 'Chi tiết một người đại diện (public)' })
  @ApiResponse({ status: 200, type: LandingRepresentativeDto })
  landingDetail(@Param('userId', ParseIntPipe) userId: number): Promise<LandingRepresentativeDto> {
    return this.saleService.landingDetail(userId);
  }
}
