import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import {
  CreatePartnerLogoDto, PartnerLogoDto, ReorderPartnerLogosDto, UpdatePartnerLogoDto,
} from './dto/partner-logo.dto';
import { PartnerLogosService } from './partner-logos.service';

/* Cùng ma trận quyền với màn CMS: ai sửa được CMS thì quản được logo; người
   chỉ được xem CMS thì chỉ đọc được danh sách (GET), không thêm/xoá/bật tắt. */
@ApiTags('CMS')
@Trang('cms')
@Controller()
export class PartnerLogosController {
  constructor(private readonly logos: PartnerLogosService) {}

  /** @Public vì landing gọi lúc dựng trang; logo vốn đã in công khai trên trang chủ. */
  @Get('landing/partner-logos')
  @Public()
  @ApiOperation({ summary: 'Logo đối tác đang bật, theo thứ tự hiện (công khai)' })
  @ApiResponse({ status: 200, type: [PartnerLogoDto] })
  congKhai(): Promise<PartnerLogoDto[]> {
    return this.logos.congKhai();
  }

  @Get('cms/partner-logos')
  @ApiOperation({ summary: 'Mọi logo đối tác, kể cả đang tắt' })
  @ApiResponse({ status: 200, type: [PartnerLogoDto] })
  tatCa(): Promise<PartnerLogoDto[]> {
    return this.logos.tatCa();
  }

  @Post('cms/partner-logos')
  @ApiOperation({ summary: 'Thêm một logo vào cuối dải' })
  @ApiResponse({ status: 201, type: PartnerLogoDto })
  tao(@Body() dto: CreatePartnerLogoDto): Promise<PartnerLogoDto> {
    return this.logos.tao(dto);
  }

  /* Phải khai TRƯỚC ':id' không thì Nest coi "order" là một id. */
  @Put('cms/partner-logos/order')
  @ApiOperation({ summary: 'Đặt lại thứ tự cả một nhóm logo (kéo thả trên CMS)' })
  @ApiResponse({ status: 200, type: [PartnerLogoDto] })
  sapXep(@Body() dto: ReorderPartnerLogosDto): Promise<PartnerLogoDto[]> {
    return this.logos.sapXep(dto);
  }

  @Patch('cms/partner-logos/:id')
  @ApiOperation({ summary: 'Đổi tên, hoặc bật/tắt một logo' })
  @ApiResponse({ status: 200, type: PartnerLogoDto })
  sua(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePartnerLogoDto): Promise<PartnerLogoDto> {
    return this.logos.sua(id, dto);
  }

  @Delete('cms/partner-logos/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xoá hẳn một logo' })
  async xoa(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.logos.xoa(id);
    return { ok: true };
  }
}
