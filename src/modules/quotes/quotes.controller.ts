import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { onePage, PageResult } from '@/common/dto/pagination.dto';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import { QUEUE_MAX_LIMIT, QueueQueryDto } from './dto/queue-query.dto';
import {
  AddDepartmentDto, AssignDto, PassDto, QueueItemDto, QueuePageDto, QuoteDto, QuoteHistoryDto,
  ReferencePriceDto, ReferencePricePageDto, RequestRevisionDto, SelectQuoteDto, SetSalePriceDto,
  TransferDto,
} from './dto/quote.dto';
import { QuoteHistoryService } from './quote-history.service';
import { QueueService } from './queue.service';
import { QuotesService } from './quotes.service';
import { SelectionService } from './selection.service';

@ApiTags('Quotes (F2/F3)')
@Controller()
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly selectionService: SelectionService,
    private readonly queueService: QueueService,
    private readonly quoteHistoryService: QuoteHistoryService,
  ) {}

  @Post('orders/:id/departments/:deptId/claim')
  /* CHỈ Pricing (vai trò `staff`) nhận đơn (12/10/2026): người nhận là người
     chịu trách nhiệm nhập báo giá. Trưởng phòng muốn ai làm thì GIAO (assign),
     không tự nhận thay. */
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Pricing tự nhận đơn — người nhận chịu trách nhiệm báo giá' })
  @ApiResponse({ status: 201 })
  async claim(
    @Param('id', ParseIntPipe) id: number,
    @Param('deptId', ParseIntPipe) deptId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.quotesService.claim(id, deptId, user);
    return { ok: true };
  }

  @Post('orders/:id/departments/:deptId/assign')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Trưởng phòng gán đơn cho nhân viên' })
  @ApiResponse({ status: 201 })
  async assign(
    @Param('id', ParseIntPipe) id: number,
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() dto: AssignDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.quotesService.assign(id, deptId, dto, user);
    return { ok: true };
  }

  @Post('orders/:id/departments/:deptId/pass')
  @Roles(Role.MANAGER, Role.STAFF)
  @ApiOperation({ summary: 'Bỏ qua đơn — bắt buộc kèm lý do' })
  @ApiResponse({ status: 201 })
  async pass(
    @Param('id', ParseIntPipe) id: number,
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() dto: PassDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.quotesService.pass(id, deptId, dto, user);
    return { ok: true };
  }

  @Post('orders/:id/departments/:deptId/transfer')
  @Roles(Role.MANAGER, Role.ADMIN)
  @ApiOperation({ summary: 'Chuyển đơn sang phòng khác (F3)' })
  @ApiResponse({ status: 201 })
  async transfer(
    @Param('id', ParseIntPipe) id: number,
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() dto: TransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.quotesService.transfer(id, deptId, dto, user);
    return { ok: true };
  }

  @Post('orders/:id/departments/:deptId/quote')
  /* Chỉ Pricing — và chỉ đúng người đang phụ trách dòng đó, xem
     QuotesService.quote. */
  @Roles(Role.STAFF)
  @ApiOperation({ summary: 'Gửi / cập nhật báo giá — chỉ Pricing đang phụ trách đơn' })
  @ApiResponse({ status: 201 })
  async quote(
    @Param('id', ParseIntPipe) id: number,
    @Param('deptId', ParseIntPipe) deptId: number,
    @Body() dto: QuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.quotesService.quote(id, deptId, dto, user);
    return { ok: true };
  }

  // QA-16: lịch sử vẫn được ghi mỗi lần báo giá lại, trước đây không đọc ra được.
  @Get('orders/:id/departments/:deptId/quote-history')
  @ApiOperation({
    summary: 'Các bản báo giá đã bị ghi đè của một phòng',
    description:
      'Báo giá kín: chỉ phòng đó, sale tạo đơn, và vai trò cấp công ty đọc được. ' +
      'Bản đang hiệu lực KHÔNG nằm trong history — nó ở chi tiết đơn.',
  })
  @ApiResponse({ status: 200, type: QuoteHistoryDto })
  quoteHistory(
    @Param('id', ParseIntPipe) id: number,
    @Param('deptId', ParseIntPipe) deptId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteHistoryDto> {
    return this.quoteHistoryService.history(id, deptId, user);
  }

  @Post('orders/:id/departments')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Thêm phòng ngoài cấu hình vào đơn' })
  @ApiResponse({ status: 201 })
  async addDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.selectionService.addDepartment(id, dto, user);
    return { ok: true };
  }

  @Get('orders/:id/reference-prices')
  @Roles(Role.MANAGER, Role.STAFF, Role.ADMIN)
  @ApiOperation({ summary: '5 đơn thành công khớp nhất — căn cứ báo giá' })
  @ApiResponse({ status: 200, type: ReferencePricePageDto })
  async referencePrices(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<ReferencePriceDto>> {
    return onePage(await this.selectionService.referencePrices(id, user));
  }

  @Post('orders/:id/select-quote')
  @Roles(Role.SALE, Role.ADMIN)
  @ApiOperation({ summary: 'Chọn báo giá thắng — phòng đó thành phòng phụ trách' })
  @ApiResponse({ status: 201 })
  async selectQuote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SelectQuoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.selectionService.selectQuote(id, dto, user);
    return { ok: true };
  }

  @Post('orders/:id/sale-price')
  @Roles(Role.SALE, Role.ADMIN)
  @ApiOperation({
    summary: 'Sale nhập giá chốt với khách (≥ giá phòng thắng)',
    description:
      'Mọi đơn, gọi sau khi chọn báo giá thắng. Đơn landing bắt buộc (khách chỉ được báo giá ' +
      'khi đã nhập); đơn khác không nhập thì dùng giá phòng thắng.',
  })
  @ApiResponse({ status: 201 })
  async setSalePrice(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetSalePriceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.selectionService.setSalePrice(id, dto, user);
    return { ok: true };
  }

  @Post('orders/:id/request-revision')
  @Roles(Role.SALE, Role.ADMIN)
  @ApiOperation({ summary: 'Mở lại vòng giá — hoàn tác việc chọn nếu đã chọn' })
  @ApiResponse({ status: 201 })
  async requestRevision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestRevisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.selectionService.requestRevision(id, dto, user);
    return { ok: true };
  }

  @Get('queue')
  /* Màn "Hàng đợi phòng ban" — MA TRẬN quyết định ai vào, không phải danh sách
     vai trò viết cứng. Bỏ @Roles(MANAGER, STAFF) ở đây vì giữ lại thì ô trong
     ma trận bật lên mà API vẫn 403, đúng kiểu hỏng khó tìm nhất: màn quản trị
     nói một đằng, hệ thống làm một nẻo.

     Mọi endpoint CÒN LẠI của controller này giữ nguyên @Roles: chúng là thao
     tác trên một đơn (nhận, chuyển, báo giá, chốt) chứ không phải một màn. */
  @Trang('queue')
  @ApiOperation({ summary: 'Hàng đợi phòng mình' })
  // Khai tay theo đúng lối của /customers và /news. @ApiPropertyOptional trong
  // DTO không đủ để hai trường số này vào docs-json — /orders cũng đang thiếu y
  // hệt. Mà không có chúng trong đặc tả thì app đọc docs không hề biết endpoint
  // này phân trang được, tức là mất đúng thứ thay đổi này sinh ra để cho.
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: `Mặc định ${QUEUE_MAX_LIMIT}, tối đa ${QUEUE_MAX_LIMIT} — giữ nguyên hành vi cũ`,
  })
  @ApiResponse({ status: 200, type: QueuePageDto })
  async queue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueueQueryDto,
  ): Promise<PageResult<QueueItemDto>> {
    return this.queueService.myQueue(user, query);
  }
}
