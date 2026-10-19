import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe,
  Patch, Post, Query, Req, Res,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { clamp, MAX_PAGE, PageResult } from '@/common/dto/pagination.dto';
import { Trang } from '@/common/permissions/page.decorator';
import { GioiHanTraGia } from './gioi-han-tra-gia';
import { PricingIoService } from './pricing-io.service';
import { PricingXuatService } from './pricing-xuat.service';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { chanTaiPhienKhac, phienDuocDoc } from './phien-cho-doi-tac.helper';
import { OrdersQueryService } from '../orders/orders-query.service';
import { PricingService } from './pricing.service';
import {
  CreateRoutePriceDto, ImportResultDto, ListedPriceDto, PriceUnitDto,
  RoutePricePageDto, RoutePriceResponseDto, UpdateRoutePriceDto,
} from './dto/pricing.dto';

/** Fastify multipart — request có hàm file() khi bật @fastify/multipart. */
type MultipartRequest = FastifyRequest & {
  isMultipart(): boolean;
  file(): Promise<{ filename: string; toBuffer(): Promise<Buffer> } | undefined>;
};

@ApiTags('Bảng giá tuyến')
@Controller()
/* Cả bảng giá là MỘT trang trong ma trận: màn "Giá niêm yết" đã bỏ, nó chỉ là
   cùng bảng này khoá vào phiên đang áp dụng. Ô "Địa điểm" khai riêng ở handler
   của nó. */
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('priceList')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly io: PricingIoService,
    private readonly xuat: PricingXuatService,
    private readonly gioiHan: GioiHanTraGia,
    /* Chi de KIEM PHAM VI don: `findScoped` tu nem 404 khi don nam ngoai tam
       nhin cua nguoi goi, nen gia tra ve chi bao gio noi ve mot tuyen ho von
       da thay. */
    private readonly donQuery: OrdersQueryService,
  ) {}

  /* ---------------------------------------------------------------- địa điểm */

  /* ---------------------------------------------------------------- giá tuyến */

  @Get('route-prices')
  @ApiOperation({
    summary: 'Bảng giá tuyến',
    description:
      'Bỏ trống sessionId = phiên ĐANG ÁP DỤNG, tức là giá niêm yết hiện hành. ' +
      'Chưa công bố phiên nào thì trả danh sách rỗng.',
  })
  @ApiQuery({ name: 'sessionId', required: false, type: Number })
  @ApiQuery({ name: 'q', required: false, description: 'Tìm theo tên điểm đi / điểm đến' })
  @ApiQuery({ name: 'serviceId', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 50, tối đa 100' })
  @ApiQuery({
    name: 'unitCode',
    required: false,
    description:
      'Lọc theo đơn vị tính. Một tuyến có 6-11 dòng khác nhau đúng ở ô này, nên ' +
      'lọc một đơn vị thì bảng trở về một dòng một tuyến.',
  })
  @ApiResponse({ status: 200, type: RoutePricePageDto })
  listPrices(
    @CurrentUser() user: AuthenticatedUser,
    @Query('sessionId') sessionId?: string,
    @Query('q') q?: string,
    @Query('serviceId') serviceId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unitCode') unitCode?: string,
  ): Promise<PageResult<RoutePriceResponseDto>> {
    return this.pricing.listPrices(
      // Đối tác: tham số phiên bị bỏ qua, luôn là phiên đang áp dụng.
      phienDuocDoc(user, sessionId ? Number(sessionId) : undefined),
      q,
      serviceId ? Number(serviceId) : undefined,
      clamp(page, 1, 1, MAX_PAGE),
      clamp(limit, 50, 1, 100),
      unitCode,
    );
  }

  @Post('route-prices')
  @ApiOperation({ summary: 'Thêm một dòng giá' })
  @ApiResponse({ status: 201, type: RoutePriceResponseDto })
  createPrice(@Body() dto: CreateRoutePriceDto): Promise<RoutePriceResponseDto> {
    return this.pricing.createPrice(dto);
  }

  @Patch('route-prices/:id')
  @ApiOperation({ summary: 'Sửa giá / ghi chú' })
  @ApiResponse({ status: 200, type: RoutePriceResponseDto })
  updatePrice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoutePriceDto,
  ): Promise<RoutePriceResponseDto> {
    return this.pricing.updatePrice(id, dto);
  }

  @Delete('route-prices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá một dòng giá' })
  deletePrice(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.pricing.deletePrice(id);
  }

  /* ---------------------------------------------------------------- nhập/xuất */

  /* Khoá trang RIÊNG, không dùng `priceList` của cả controller.

     Từ 057, Sale và Pricing có `priceList = none` — họ không duyệt được cả
     bảng giá nữa. Nhưng ô gợi ý giá trong màn báo giá thì vẫn phải chạy, nếu
     không 057 gỡ mất một tính năng đang dùng. Một khoá riêng nói rõ hai thứ đó
     là hai quyền khác nhau, và ma trận vẫn là nơi DUY NHẤT quyết định. */
  /* Danh mục, không phải bảng giá: nó chỉ nói "có những loại xe nào", không
     nói giá nào cả. Nên để dưới `priceLookup` chứ không `priceList` — Sale và
     Pricing cần nó để đọc được nhãn của mức giá đang xem. */
  @Get('price-units')
  @Trang('priceLookup')
  @ApiOperation({ summary: 'Danh mục đơn vị tính giá' })
  @ApiResponse({ status: 200, type: [PriceUnitDto] })
  @ApiQuery({ name: 'sessionId', required: false, type: Number })
  donViTinh(@Query('sessionId') sessionId?: string): Promise<PriceUnitDto[]> {
    const so = Number(sessionId);
    return this.pricing.donViTinh(sessionId && Number.isInteger(so) ? so : undefined);
  }

  @Get('route-prices/lookup')
  @Trang('priceLookup')
  @ApiOperation({
    summary: 'Tra giá niêm yết cho một tuyến',
    description:
      'Đọc BẢNG GIÁ KHU VỰC của phiên ĐANG ÁP DỤNG (065). Khớp theo FCL/LCL suy ra từ ' +
      'dịch vụ con của đơn: một tuyến chở một cái 20DC thì giá như nhau, bất kể đơn ' +
      'thuộc dịch vụ nào. Mỗi mức giá ra hai dòng — 1 chiều và 2 chiều. ' +
      'Trả units = [] khi chưa công bố phiên nào, chưa đủ cặp điểm đi/điểm đến, dịch vụ ' +
      'con không mang đuôi FCL/LCL, hoặc bảng giá không có tuyến đó — KHÁC với giá 0.',
  })
  @ApiQuery({ name: 'originId', required: false, type: Number })
  @ApiQuery({ name: 'destinationId', required: false, type: Number })
  @ApiQuery({ name: 'serviceChildId', required: false, type: Number })
  @ApiResponse({ status: 200, type: ListedPriceDto })
  async lookup(
    @CurrentUser() user: AuthenticatedUser,
    @Query('originId') originId?: string,
    @Query('destinationId') destinationId?: string,
    @Query('serviceChildId') serviceChildId?: string,
  ): Promise<ListedPriceDto> {
    await this.gioiHan.ghiNhan(user);
    const ra = await this.pricing.giaNiemYet(
      originId ? Number(originId) : null,
      destinationId ? Number(destinationId) : null,
      serviceChildId ? Number(serviceChildId) : null,
    );
    return ra
      ? { units: ra.units, sessionId: ra.sessionId, sessionName: ra.sessionName }
      : { units: [], sessionId: null, sessionName: null };
  }

  /**
   * Giá niêm yết của tuyến mà MỘT ĐƠN CỤ THỂ đang đi.
   *
   * Đi theo quyền ĐƠN HÀNG, không theo quyền màn bảng giá: đơn đã phân phối về
   * phòng ban thì ai xử lý đơn cũng cần thấy giá của đúng tuyến đó để báo giá.
   * Thứ họ không được phép là DUYỆT CẢ BẢNG GIÁ — cơ cấu chi phí của Bee trên
   * mọi tuyến — và đó là `priceList`, một khoá khác.
   *
   * Nhận `orderId` chứ không nhận cặp địa điểm: `findScoped` đã chặn đơn ngoài
   * phạm vi của người gọi, nên câu trả lời chỉ bao giờ nói về một tuyến mà họ
   * vốn đã nhìn thấy. Để họ tự gửi cặp địa điểm là mở đường dò cả bảng giá
   * bằng cách thử từng cặp.
   */
  @Get('orders/:id/listed-price')
  @Trang('orders')
  @ApiOperation({
    summary: 'Giá niêm yết của tuyến đơn này đang đi',
    description:
      'Theo phiên ĐANG ÁP DỤNG, khớp FCL/LCL theo dịch vụ con của đơn. Trả units = [] khi ' +
      'đơn chưa khai đủ hai đầu, dịch vụ con không mang đuôi FCL/LCL, hoặc bảng giá không ' +
      'có tuyến đó — KHÁC với giá 0.',
  })
  @ApiResponse({ status: 200, type: ListedPriceDto })
  async giaCuaDon(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListedPriceDto> {
    const don = await this.donQuery.findReadable(id, user);
    /* Tra theo LÚC TẠO ĐƠN, không phải lúc mở màn hình: đơn đã báo giá theo
       bảng giá hồi đó, và công bố phiên mới không được làm con số ấy biến
       mất khỏi màn của người đang xử lý đơn. */
    const ra = await this.pricing.giaNiemYet(
      don.originLocationId,
      don.destinationLocationId,
      don.serviceChildId,
      don.createdAt,
    );
    return ra
      ? { units: ra.units, sessionId: ra.sessionId, sessionName: ra.sessionName }
      : { units: [], sessionId: null, sessionName: null };
  }

  @Get('route-prices/template')
  @ApiOperation({
    summary: 'Tải file MẪU để nhập bảng giá',
    description:
      'Khác file xuất: file xuất chỉ là mẫu khi phiên đã có dữ liệu. File này luôn có ' +
      'cột đúng, vài dòng ví dụ dựng từ địa điểm và dịch vụ CÓ THẬT, và một trang ' +
      '"Danh mục" liệt kê tên để chép — import khớp theo tên, nên đưa danh sách để ' +
      'chép còn hơn để họ gõ tay rồi sai một dấu.',
  })
  async template(@Res() res: FastifyReply): Promise<void> {
    const { buffer, fileName } = await this.xuat.templateFile();
    await res
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(buffer);
  }

  @Get('price-sessions/:id/export')
  @ApiOperation({
    summary: 'Xuất bảng giá ra Excel',
    description: 'File xuất ra chính là MẪU để nhập vào: cùng tiêu đề cột, cùng thứ tự.',
  })
  async exportPrices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: FastifyReply,
  ): Promise<void> {
    chanTaiPhienKhac(user, id, await this.pricing.idPhienDangApDung());
    const { buffer, fileName } = await this.xuat.exportPrices(id);
    await res
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .send(buffer);
  }

  @Post('price-sessions/:id/import')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Nhập bảng giá từ Excel',
    description:
      'Khớp địa điểm và dịch vụ theo TÊN. Tên không khớp thì bỏ dòng và báo rõ dòng nào — ' +
      'không tự tạo địa điểm mới, vì một lỗi gõ sẽ lặng lẽ sinh ra đầu tuyến thứ hai.',
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
  async importPrices(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: FastifyRequest,
  ): Promise<ImportResultDto> {
    const mp = req as MultipartRequest;
    if (!mp.isMultipart()) throw new BadRequestException('Phải gửi dạng multipart/form-data');
    const part = await mp.file();
    if (!part) throw new BadRequestException('Không có file nào được gửi lên');
    return this.io.importPrices(id, await part.toBuffer());
  }
}
