import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch,
  Post, Query, Req, Res,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PageResult } from '@/common/dto/pagination.dto';
import { Trang } from '@/common/permissions/page.decorator';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  ImportResultDto, PriceRegionDto, RegionRouteDto, RegionRoutePageDto, SaveRegionDto,
  SaveRegionRouteDto,
} from './dto/pricing.dto';
import { RegionRouteIoService } from './region-route-io.service';
import { RegionRoutesService } from './region-routes.service';

/**
 * Khu vực và tuyến — màn "Khu vực và tuyến" của bảng giá (061).
 *
 * Cùng ô `priceList` trong ma trận phân quyền với bảng giá: đây là một tab của
 * chính màn đó, nên bật tắt chung là đúng — hai ô cho một màn thì bật một ô
 * vẫn thấy màn trống. Guard tự suy bậc theo phương thức HTTP: đọc cần `view`,
 * thêm/sửa cần `edit`, xoá cần `full`.
 */
@ApiTags('Bảng giá tuyến')
@Controller()
@Trang('priceList')
export class RegionRoutesController {
  constructor(
    private readonly tuyen: RegionRoutesService,
    private readonly io: RegionRouteIoService,
  ) {}

  @Get('price-regions')
  @ApiOperation({
    summary: 'Danh mục khu vực, kèm số tuyến và số địa điểm',
    description:
      'Số tuyến đếm theo tuyến ĐI TỪ khu vực này — khu vực của một tuyến là khu vực của '
      + 'địa điểm nhận.',
  })
  @ApiResponse({ status: 200, type: [PriceRegionDto] })
  @ApiQuery({ name: 'sessionId', required: false, type: Number })
  listRegions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sessionId') sessionId?: string,
  ): Promise<PriceRegionDto[]> {
    return this.tuyen.listRegions(user, so(sessionId));
  }

  @Post('price-regions')
  @ApiOperation({ summary: 'Thêm khu vực' })
  @ApiResponse({ status: 201, type: PriceRegionDto })
  createRegion(@Body() dto: SaveRegionDto): Promise<PriceRegionDto> {
    return this.tuyen.createRegion(dto);
  }

  @Patch('price-regions/:id')
  @ApiOperation({ summary: 'Đổi tên khu vực' })
  @ApiResponse({ status: 200, type: PriceRegionDto })
  updateRegion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveRegionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PriceRegionDto> {
    return this.tuyen.updateRegion(id, dto, user);
  }

  @Delete('price-regions/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Xoá khu vực',
    description:
      'Chỉ xoá được khu vực KHÔNG còn địa điểm nào. Còn địa điểm thì trả 409: địa điểm '
      + 'nằm trong đơn cũ và bảng giá cũ, xoá theo là mất cả hai.',
  })
  deleteRegion(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.tuyen.deleteRegion(id);
  }

  /* ----------------------------------------------------------------- tuyến */

  @Get('region-routes')
  @ApiOperation({ summary: 'Danh sách tuyến, có lọc và phân trang' })
  @ApiQuery({ name: 'sessionId', required: false, type: Number })
  @ApiQuery({ name: 'regionId', required: false, type: Number })
  @ApiQuery({ name: 'originProvince', required: false })
  @ApiQuery({ name: 'destinationProvince', required: false })
  @ApiQuery({ name: 'originLocationId', required: false, type: Number })
  @ApiQuery({ name: 'destinationLocationId', required: false, type: Number })
  @ApiQuery({ name: 'kind', required: false, enum: ['FCL', 'LCL'] })
  @ApiQuery({ name: 'unitCode', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: RegionRoutePageDto })
  listRoutes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sessionId') sessionId?: string,
    @Query('regionId') regionId?: string,
    @Query('originProvince') originProvince?: string,
    @Query('destinationProvince') destinationProvince?: string,
    @Query('originLocationId') originLocationId?: string,
    @Query('destinationLocationId') destinationLocationId?: string,
    @Query('kind') kind?: string,
    @Query('unitCode') unitCode?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<RegionRouteDto>> {
    return this.tuyen.listRoutes({
      sessionId: so(sessionId),
      regionId: so(regionId),
      originProvince,
      destinationProvince,
      originLocationId: so(originLocationId),
      destinationLocationId: so(destinationLocationId),
      kind: kind === 'FCL' || kind === 'LCL' ? kind : undefined,
      unitCode: unitCode || undefined,
      page: so(page) ?? 1,
      /* Chặn trên 200: bảng này có thể rất dài, và một `limit` do người gọi
         tự điền là cách dễ nhất để vô tình tải cả bảng giá về một lần. */
      limit: Math.min(so(limit) ?? 20, 200),
    }, user);
  }

  @Get('price-regions/:id/routes')
  @ApiOperation({
    summary: 'Tuyến của một khu vực',
    description: 'Bảng bên phải của màn hình. Không phân trang: một khu vực không có quá nhiều tuyến.',
  })
  @ApiResponse({ status: 200, type: [RegionRouteDto] })
  @ApiQuery({ name: 'sessionId', required: false, type: Number })
  listRoutesOfRegion(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('sessionId') sessionId?: string,
  ): Promise<RegionRouteDto[]> {
    return this.tuyen.listRoutesOfRegion(id, user, so(sessionId));
  }

  @Post('region-routes')
  @ApiOperation({
    summary: 'Thêm tuyến kèm giá',
    description:
      'Không nhận khu vực và tỉnh: khu vực suy ra từ khu vực của địa điểm NHẬN, tỉnh là '
      + 'tỉnh của địa điểm. Gửi kèm chúng là mở đường cho một tuyến ghi "Miền Nam" trong '
      + 'khi kho của nó ở Đà Nẵng.',
  })
  @ApiResponse({ status: 201, type: RegionRouteDto })
  createRoute(
    @Body() dto: SaveRegionRouteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RegionRouteDto> {
    return this.tuyen.createRoute(dto, user);
  }

  @Patch('region-routes/:id')
  @ApiOperation({
    summary: 'Sửa tuyến',
    description: '`services` THAY CẢ danh sách giá — mức giá bị xoá trên màn hình mất thật.',
  })
  @ApiResponse({ status: 200, type: RegionRouteDto })
  updateRoute(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveRegionRouteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RegionRouteDto> {
    return this.tuyen.updateRoute(id, dto, user);
  }

  @Delete('region-routes/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xoá tuyến — xoá luôn mọi mức giá của nó' })
  deleteRoute(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.tuyen.deleteRoute(id, user);
  }

  /* ------------------------------------------------------------------ Excel */

  @Get('region-routes/template')
  @ApiOperation({
    summary: 'Tải file MẪU bảng giá khu vực',
    description:
      'Dạng RỘNG: mỗi dòng là một tuyến × một dịch vụ con, mỗi đơn vị tính hai cột giá '
      + '(1 chiều / 2 chiều). Kèm sheet HuongDan và sheet DanhMuc có ô xổ xuống — import '
      + 'khớp theo TÊN, nên đưa danh sách để chọn còn hơn để gõ tay rồi sai một dấu.',
  })
  async template(@Res() res: FastifyReply): Promise<void> {
    await taiVe(res, await this.io.templateFile());
  }

  @Get('region-routes/export')
  @ApiOperation({
    summary: 'Xuất bảng giá khu vực ra Excel',
    description:
      'Cùng cấu trúc với file mẫu, nên xuất → sửa → nhập lại được. Chỉ in những đơn vị '
      + 'tính đang có giá: in cả 27 đơn vị là 54 cột, mà một bảng giá thật dùng 6–10 bậc.',
  })
  @ApiQuery({ name: 'sessionId', required: false, type: Number })
  async exportFile(
    @Res() res: FastifyReply,
    @Query('sessionId') sessionId?: string,
  ): Promise<void> {
    await taiVe(res, await this.io.exportFile(so(sessionId)));
  }

  @Post('region-routes/import')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Nhập bảng giá khu vực từ Excel',
    description:
      'KHÔNG xoá tuyến cũ: tuyến có trong file thì ghi đè, tuyến khác giữ nguyên — file '
      + 'thường chỉ là một phần bảng giá. Trong một tuyến, dịch vụ con có mặt trong file '
      + 'bị thay CẢ bảng giá. Cột "Khu vực" sửa khu vực của ĐỊA ĐIỂM ĐI, nên nó đổi mọi '
      + 'tuyến đi từ địa điểm đó.',
  })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'Tên trường phải là "file"' } },
    },
  })
  @ApiResponse({ status: 201, type: ImportResultDto })
  @ApiQuery({ name: 'sessionId', required: false, type: Number })
  async importFile(
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser,
    @Query('sessionId') sessionId?: string,
  ): Promise<ImportResultDto> {
    const mp = req as unknown as {
      isMultipart(): boolean;
      file(): Promise<{ toBuffer(): Promise<Buffer> } | undefined>;
    };
    if (!mp.isMultipart()) throw new BadRequestException('Phải gửi dạng multipart/form-data');
    const part = await mp.file();
    if (!part) throw new BadRequestException('Không có file nào được gửi lên');
    return this.io.importFile(await part.toBuffer(), user, so(sessionId));
  }
}

/** Gửi một file Excel về trình duyệt. Ba endpoint dùng chung đúng ba dòng này. */
async function taiVe(
  res: FastifyReply, file: { buffer: Buffer; fileName: string },
): Promise<void> {
  await res
    .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .header('Content-Disposition', `attachment; filename="${file.fileName}"`)
    .send(file.buffer);
}

/** Query là chuỗi; rỗng hoặc không phải số -> undefined, tức là không lọc. */
function so(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
