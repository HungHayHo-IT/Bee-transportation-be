import {
  Body, Controller, ExecutionContext, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { CurrentCustomer } from '@/common/decorators/current-customer.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CustomerJwtGuard } from '@/common/guards/customer-jwt.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums';
import { AuthenticatedCustomer } from '@/common/types/authenticated-customer.type';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ACCESS_COOKIE } from '@/common/strategies/jwt.strategy';
import { CUSTOMER_COOKIE } from '@/common/strategies/customer-jwt.strategy';
import { clamp, MAX_PAGE } from '@/common/dto/pagination.dto';
import {
  CreateQuoteRequestDto, CustomerQuoteDto, PublicQuoteRequestDto, QuoteRequestCreatedDto,
  QuoteRequestDto, QuoteRequestPageDto, RejectQuoteRequestDto,
} from './dto/quote-request.dto';
import { QuoteRequestService } from './quote-request.service';

type CookieRequest = FastifyRequest & { cookies?: Record<string, string | undefined> };

/**
 * Trần theo IP cho form báo giá — lớp phụ, nới hơn giới hạn theo số điện thoại.
 *
 * Form landing đi qua server Vercel, nên req.ip là IP của Vercel: đếm theo đó là
 * chặn chung mọi khách. Route /api/quote của web gửi kèm IP thật ở `x-client-ip`.
 * Nhân viên (có cookie đăng nhập) không bị tính — cả văn phòng dùng chung một IP.
 *
 * ponytail: header và cookie đều giả được để né TRẦN NÀY — chấp nhận, vì lớp
 * chính là giới hạn theo số điện thoại (đếm trong DB, không né bằng header).
 * Cần chặt hơn thì ký header bằng một khoá chung giữa web và backend.
 */
class TranTheoIpGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = (req.headers as Record<string, unknown> | undefined)?.['x-client-ip'];
    return typeof ip === 'string' && ip ? ip : String(req.ip);
  }

  protected async shouldSkip(ctx: ExecutionContext): Promise<boolean> {
    return Boolean(ctx.switchToHttp().getRequest<CookieRequest>().cookies?.[ACCESS_COOKIE]);
  }
}

@ApiTags('Quote Requests')
@Controller('quote-requests')
export class QuoteRequestController {
  constructor(
    private readonly service: QuoteRequestService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Public: form landing gửi lên. Cookie có sao dùng vậy — nhân viên nội bộ
   * (ACCESS_COOKIE) ghi createdBy, khách hàng (CUSTOMER_COOKIE) ghi customerId.
   * Không có cookie -> lưu ẩn danh, cả hai đều null.
   */
  @Post()
  @Public()
  @UseGuards(TranTheoIpGuard)
  @Throttle({ default: { ttl: 60 * 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Gửi yêu cầu báo giá (public, gắn user/customer nếu có)',
    description: 'Khách: tối đa 3 yêu cầu/số điện thoại/24 giờ và 10 yêu cầu/IP/giờ — vượt thì 429.',
  })
  @ApiResponse({ status: 429, description: 'Vượt giới hạn theo số điện thoại hoặc IP' })
  @ApiResponse({ status: 201, type: QuoteRequestCreatedDto })
  async create(
    @Body() dto: CreateQuoteRequestDto,
    @Req() req: CookieRequest,
  ): Promise<QuoteRequestCreatedDto> {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    let createdBy: number | null = null;
    let customerId: number | null = null;

    const staffToken = req.cookies?.[ACCESS_COOKIE];
    if (staffToken) {
      try {
        const p = await this.jwt.verifyAsync<{ sub: number; type?: string }>(staffToken, { secret });
        if (Number.isInteger(p?.sub) && p.type !== 'customer') createdBy = p.sub;
      } catch { /* token hỏng — bỏ qua, giữ null */ }
    }

    const customerToken = req.cookies?.[CUSTOMER_COOKIE];
    if (customerToken) {
      try {
        const p = await this.jwt.verifyAsync<{ sub: number; type?: string }>(customerToken, { secret });
        if (Number.isInteger(p?.sub) && p.type === 'customer') customerId = p.sub;
      } catch { /* token hỏng — bỏ qua, giữ null */ }
    }
    return this.service.create(dto, createdBy, customerId);
  }

  /**
   * Khách vãng lai tra lại yêu cầu của mình. Phải khai báo TRƯỚC `@Get(':id')`,
   * nếu không 'lookup' rơi vào route đó và chết ở ParseIntPipe.
   *
   * Giới hạn theo IP là bắt buộc chứ không phải phòng xa: id là số tăng dần nên
   * không có nó thì kẻ xấu quét id 1..n ghép với vài số điện thoại phổ biến,
   * mỗi lượt là một lần thử khoá miễn phí. 10 lần/phút thừa cho người thật gõ
   * lại mã trong app, vô dụng cho việc quét.
   */
  @Get('lookup')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Tra cứu yêu cầu báo giá bằng mã + số điện thoại (public)',
    description:
      'Dành cho khách gửi form khi chưa đăng nhập. Phải khớp CẢ HAI tham số; '
      + 'mọi trường hợp không khớp đều trả về cùng một 404 để không lộ mã nào có thật. '
      + 'Yêu cầu đã gắn tài khoản thì dùng /quote-requests/my/:id. Giới hạn 10 lần/phút/IP.',
  })
  @ApiQuery({ name: 'id', required: true, type: Number, description: 'Mã yêu cầu nhận được lúc gửi form' })
  @ApiQuery({ name: 'phone', required: true, type: String, description: 'Số điện thoại đã khai trên form' })
  @ApiResponse({ status: 200, type: PublicQuoteRequestDto })
  @ApiResponse({ status: 404, description: 'Không có yêu cầu nào khớp cả mã lẫn số điện thoại' })
  lookup(
    @Query('id') id?: string,
    @Query('phone') phone?: string,
  ): Promise<PublicQuoteRequestDto> {
    // Không ParseIntPipe, không DTO validate: thiếu tham số hay id là rác cũng
    // phải ra đúng cái 404 kia, chứ 400 kèm chi tiết là một tín hiệu khác biệt.
    return this.service.publicLookup(id ?? '', phone ?? '');
  }

  /* -------------------------------------- Endpoint dành riêng cho khách hàng */

  @Get('my/list')
  @Public()
  @UseGuards(CustomerJwtGuard)
  @ApiOperation({ summary: 'Yêu cầu của tôi (khách đang đăng nhập)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'converted', 'rejected'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: QuoteRequestPageDto })
  myList(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.myList(customer.id, status, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 20, 1, 100));
  }

  /**
   * Phải đứng TRƯỚC `@Get('my/:id')`: Nest khớp route theo thứ tự khai báo trong
   * class, để sau thì 'my/12/quote' không bao giờ tới được đây.
   *
   * KHÔNG có bản tương đương cho `/quote-requests/lookup`: đường đó chỉ cần id
   * (số tăng dần, đoán được) + số điện thoại, bảo vệ yếu hơn hẳn đăng nhập. Giá
   * đã chốt chỉ đi qua cửa `my/*`.
   */
  @Get('my/:id/quote')
  @Public()
  @UseGuards(CustomerJwtGuard)
  @ApiOperation({
    summary: 'Giá đã chốt của một yêu cầu của tôi',
    description:
      'Chỉ trả giá của phòng ban ĐƯỢC CHỌN, sau khi sale đã chọn. Chưa có giá thì '
      + 'vẫn là 200 với state = pending — yêu cầu vừa gửi là ca bình thường, không phải lỗi.',
  })
  @ApiResponse({ status: 200, type: CustomerQuoteDto })
  @ApiResponse({ status: 404, description: 'Không phải yêu cầu của bạn, hoặc không tồn tại' })
  myQuote(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CustomerQuoteDto> {
    return this.service.myQuote(customer.id, id);
  }

  @Get('my/:id')
  @Public()
  @UseGuards(CustomerJwtGuard)
  @ApiOperation({ summary: 'Chi tiết một yêu cầu của tôi' })
  @ApiResponse({ status: 200, type: QuoteRequestDto })
  myDetail(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<QuoteRequestDto> {
    return this.service.myDetail(customer.id, id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Danh sách yêu cầu báo giá (Admin/Sale)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'converted', 'rejected'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: QuoteRequestPageDto })
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(status, clamp(page, 1, 1, MAX_PAGE), clamp(limit, 50, 1, 200));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Chi tiết yêu cầu báo giá' })
  @ApiResponse({ status: 200, type: QuoteRequestDto })
  detail(@Param('id', ParseIntPipe) id: number): Promise<QuoteRequestDto> {
    return this.service.detail(id);
  }

  @Post(':id/reject')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Từ chối yêu cầu báo giá' })
  @ApiResponse({ status: 201, type: QuoteRequestDto })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectQuoteRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<QuoteRequestDto> {
    return this.service.reject(id, dto.reason, user);
  }
}
