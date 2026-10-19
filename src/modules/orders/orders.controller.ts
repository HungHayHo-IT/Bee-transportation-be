import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import {
  ApiExtraModels, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiResponse, ApiTags, getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { clamp, MAX_PAGE, onePage, PageResult } from '@/common/dto/pagination.dto';
import { Role } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import { OrderFilterDto } from './dto/order-filter.dto';
import {
  OrderDetailDto, OrderListItemDto, OrderPageDto, TimelineItemDto, TimelinePageDto,
} from './dto/order-response.dto';
import {
  CancelOrderDto, CloseOrderDto, CreateOrderDto, RejectOrderDto, UpdateOrderDto,
} from './dto/order.dto';
import { OrdersExportService } from './orders-export.service';
import { OrdersQueryService } from './orders-query.service';
import { OrdersService } from './orders.service';

@ApiTags('Orders (F1/F4/F5)')
@ApiExtraModels(OrderListItemDto)
@Controller('orders')
/* Mặc định cả controller thuộc trang "Danh sách đơn": mở một đơn, sửa đơn,
   chốt, huỷ đều là việc trên đơn. Ba endpoint có màn riêng thì khai đè ngay
   tại chỗ — xem @Trang ở dưới. */
@Trang('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersQuery: OrdersQueryService,
    private readonly ordersExport: OrdersExportService,
  ) {}

  @Post()
  @Trang('createOrder')
  @Roles(Role.ADMIN, Role.SALE, Role.PARTNER)
  @ApiOperation({ summary: 'Tạo đơn — sinh mã và phân phối tự động' })
  @ApiResponse({ status: 201, type: OrderDetailDto })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDetailDto> {
    return this.ordersService.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách đơn theo phạm vi quyền',
    description: 'Phân trang bằng ?page & ?limit (mặc định 1 và 20, limit tối đa 100).',
  })
  // Hai trường này kế thừa từ PaginationDto nhưng KHÔNG tự vào docs-json —
  // phải khai tay, giống /customers và /news. Thiếu chúng thì client đọc đặc tả
  // không biết endpoint phân trang được, dù nó vẫn nhận tham số.
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiOkResponse({ type: OrderPageDto })
  list(
    @Query() filter: OrderFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<OrderListItemDto>> {
    return this.ordersQuery.list(filter, user);
  }

  // QA-15: Kanban trả một map trạng thái -> mảng đơn, không phải mảng phẳng.
  // Không khai báo schema thì sinh code client ra kiểu rỗng.
  @Get('kanban')
  @Trang('ordersKanban')
  @ApiOperation({
    summary: 'Kanban — gom theo trạng thái',
    description:
      'Khóa là mã trạng thái (new, distributed, ...). Trạng thái không có đơn nào thì ' +
      'KHÔNG xuất hiện làm khóa. Tối đa 50 đơn mỗi cột, lấy từ 500 đơn mới cập nhật ' +
      'nhất trong bộ lọc — đây là bảng thao tác, không phải báo cáo đầy đủ.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      additionalProperties: { type: 'array', items: { $ref: getSchemaPath(OrderListItemDto) } },
    },
  })
  kanban(
    @Query() filter: OrderFilterDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Record<string, OrderListItemDto[]>> {
    return this.ordersQuery.kanban(filter, user);
  }

  @Get('unrouted')
  /* Điều đơn về phòng ban là việc của admin sale, nên ai vào được màn này do
     ma trận quyết định chứ không phải một danh sách vai trò viết cứng. Bỏ
     @Roles(ADMIN) ở đây: giữ lại thì ma trận có bật cũng không vào được, và ô
     đó trở thành một lời nói dối. */
  @Trang('unroutedOrders')
  @ApiOperation({ summary: 'Hàng đợi Chưa định tuyến' })
  @ApiOkResponse({ type: OrderPageDto })
  async unrouted(@CurrentUser() user: AuthenticatedUser): Promise<PageResult<OrderListItemDto>> {
    return onePage(await this.ordersQuery.unrouted(user));
  }

  @Get('export')
  @ApiOperation({
    summary: 'Xuất Excel theo bộ lọc — doanh thu che theo quyền từng dòng',
    description: 'Trả file .xlsx, tên file nằm trong header Content-Disposition.',
  })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async exportExcel(
    @Query() filter: OrderFilterDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const buf = await this.ordersExport.excel(filter, user);
    const name = `beeops-don-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
    void res
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${name}"`)
      .send(buf);
  }

  @Get(':id')
  @Trang('orderDetail')
  @ApiOperation({ summary: 'Chi tiết đơn (báo giá đã lọc theo luật báo giá kín)' })
  @ApiResponse({ status: 200, type: OrderDetailDto })
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDetailDto> {
    return this.ordersQuery.detail(id, user);
  }

  @Get(':id/timeline')
  @Trang('orderDetail')
  @ApiOperation({ summary: 'Dòng thời gian hoạt động' })
  @ApiQuery({
    name: 'page', required: false, type: Number,
    description:
      'Mặc định 1. Dòng thời gian sắp CŨ NHẤT trước, nên trang 1 là lúc đơn mới tạo — sự kiện mới nhất nằm ở trang cuối.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiResponse({ status: 200, type: TimelinePageDto })
  timeline(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<TimelineItemDto>> {
    return this.ordersQuery.timeline(id, user, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Sửa đơn — sau khi chốt bắt buộc có changeNote' })
  @ApiResponse({ status: 200, type: OrderDetailDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDetailDto> {
    return this.ordersService.update(id, dto, user);
  }

  /* CHỈ Sale. Admin không nhận đơn: nhận là ĐỨNG TÊN, mà admin đứng tên thì
     đơn lại rơi vào "chưa có sale" (xem don-chua-co-sale.ts) — bấm xong không
     đổi gì, chỉ tốn một dòng nhật ký. Admin cần giao đơn cho ai thì sửa đơn. */
  @Post(':id/nhan')
  @Roles(Role.SALE)
  @ApiOperation({ summary: 'Sale nhận đơn chưa có ai đứng tên' })
  @ApiResponse({ status: 201, type: OrderDetailDto })
  nhanDon(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDetailDto> {
    return this.ordersService.nhanDon(id, user);
  }

  @Post(':id/close')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Chốt đơn — khóa doanh thu, sinh bộ mốc' })
  @ApiResponse({ status: 201, type: OrderDetailDto })
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDetailDto> {
    return this.ordersService.close(id, dto, user);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Khách từ chối — vào mẫu số win rate' })
  @ApiResponse({ status: 201, type: OrderDetailDto })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDetailDto> {
    return this.ordersService.reject(id, dto, user);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Hủy nội bộ — ngoài win rate, bắt buộc lý do' })
  @ApiResponse({ status: 201, type: OrderDetailDto })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderDetailDto> {
    return this.ordersService.cancel(id, dto, user);
  }

  @Get(':id/confirmation.pdf')
  @Trang('orderDetail')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Phiếu xác nhận đơn hàng (PDF) gửi khách' })
  @ApiResponse({ status: 200 })
  async confirmationPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const buf = await this.ordersExport.confirmationPdf(id, user);
    void res
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="phieu-xac-nhan.pdf"`)
      .send(buf);
  }
}
