import {
  Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply } from 'fastify';
import { sessionCookieOptions } from '@/common/cookies/session-cookie';
import { CurrentCustomer } from '@/common/decorators/current-customer.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CustomerJwtGuard } from '@/common/guards/customer-jwt.guard';
import { CUSTOMER_COOKIE } from '@/common/strategies/customer-jwt.strategy';
import { AuthenticatedCustomer } from '@/common/types/authenticated-customer.type';
import {
  CheckEmailDto, CheckEmailResponseDto, CustomerLogoutDto, CustomerMeDto,
  CustomerRefreshDto, CustomerRefreshResponseDto, LoginPinDto, LoginResponseDto,
  OauthLoginDto, RegisterDto, ResetPinDto, SendOtpDto, SendOtpResponseDto, VerifyOtpDto,
  VerifyOtpResponseDto,
} from './dto/customer-auth.dto';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerOtpService } from './customer-otp.service';

/**
 * Endpoint dành cho khách hàng landing site (bee-transportation-web) — KHÔNG
 * chạm nhân viên nội bộ. Cookie JWT dùng tên riêng `customer_token`.
 */
@ApiTags('Customer Auth')
@Controller('customer-auth')
export class CustomerAuthController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly otpSvc: CustomerOtpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Dùng chung helper với cookie nhân viên: trước đây hai nơi tự đọc
   * COOKIE_SECURE theo hai cách ngược nhau nên cookie khách bị gắn Secure trên
   * môi trường http và bị vứt, trong khi cookie nhân viên vẫn sống.
   * Cookie dùng cùng JWT_SECRET, chỉ khác payload.type + tên cookie để
   * CustomerJwtStrategy nhận đúng.
   */
  private setCookie(res: FastifyReply, token: string): void {
    void res.setCookie(CUSTOMER_COOKIE, token, sessionCookieOptions(this.config));
  }

  private clearCookie(res: FastifyReply): void {
    void res.clearCookie(CUSTOMER_COOKIE, { path: '/' });
  }

  /**
   * Endpoint này trả lời "email này có tồn tại không" cho người gọi ẨN DANH, nên
   * bản thân nó là một cỗ máy dò email. Từ khi có `isStaff`, nó dò được cả email
   * NHÂN VIÊN — mà email nhân viên theo mẫu tên miền cố định nên đoán rất rẻ và
   * là mục tiêu phishing giá trị hơn email khách nhiều. Cờ thì FE bắt buộc phải
   * có để chuyển màn, nhưng dò hàng loạt thì không cần phải miễn phí.
   *
   * 10 lần/phút/IP: thừa cho người thật gõ email, vô dụng cho việc quét danh sách.
   */
  @Post('check-email')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra email đã đăng ký chưa',
    description:
      'FE dùng để quyết định luồng: register mới, login với provider đã liên kết, '
      + 'hay chuyển sang màn đăng nhập nhân viên khi isStaff=true và exists=false. '
      + 'Giới hạn 10 lần/phút/IP.',
  })
  @ApiResponse({ status: 200, type: CheckEmailResponseDto })
  checkEmail(@Body() dto: CheckEmailDto): Promise<CheckEmailResponseDto> {
    return this.auth.checkEmail(dto.email);
  }

  /**
   * Đã có cooldown theo TỪNG email (`resendAfter`), nhưng cái đó không chặn được
   * việc rải OTP tới hàng loạt email khác nhau — mỗi email một lần là lách sạch.
   * Giới hạn theo IP mới bịt đường đó, và cũng chặn việc mượn hệ thống để spam
   * hộp thư người khác.
   */
  @Post('otp/send')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Gửi OTP qua email (register/login/reset_pin/change_email)',
    description: 'Giới hạn 5 lần/phút/IP, cộng thêm cooldown riêng theo từng email.',
  })
  @ApiResponse({ status: 201, type: SendOtpResponseDto })
  @ApiResponse({ status: 409, description: 'purpose=register mà email đã có tài khoản' })
  async sendOtp(@Body() dto: SendOtpDto): Promise<SendOtpResponseDto> {
    const { resendAfter } = await this.auth.sendOtp(dto.email, dto.purpose);
    return { ok: true as const, resendAfter };
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra OTP đúng không — trả vé cho bước cuối',
    description:
      'Mã bị đốt tại đây, dùng đúng một lần. Với purpose register và reset_pin, '
      + 'response kèm `ticket` sống 10 phút — đưa nó cho /register hoặc /reset-pin.',
  })
  @ApiResponse({ status: 200, type: VerifyOtpResponseDto })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    return this.auth.verifyOtp(dto.email, dto.purpose, dto.code);
  }

  @Post('register')
  @Public()
  @ApiOperation({
    summary: 'Đăng ký tài khoản — đổi vé lấy tài khoản, đặt PIN 6 số',
    description: 'Gọi /otp/send rồi /otp/verify (purpose=register) trước để lấy vé.',
  })
  @ApiResponse({ status: 201, type: LoginResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponseDto> {
    const { token, refreshToken, me } = await this.auth.register(dto);
    this.setCookie(res, token);
    return { me, token, refreshToken };
  }

  @Post('login/pin')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng Email + PIN 6 số' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async loginPin(
    @Body() dto: LoginPinDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponseDto> {
    const { token, refreshToken, me } = await this.auth.loginPin(dto);
    this.setCookie(res, token);
    return { me, token, refreshToken };
  }

  /**
   * Thay cho `login/otp` + `me/set-pin` trước đây: quên PIN giờ là một bước,
   * một mã OTP, không phải đăng nhập tạm rồi mới đổi.
   */
  @Post('reset-pin')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt lại PIN khi quên — đổi vé lấy PIN mới',
    description: 'Gọi /otp/send rồi /otp/verify (purpose=reset_pin) trước để lấy vé.',
  })
  @ApiResponse({ status: 204, description: 'Đã đặt PIN mới — đăng nhập lại bằng PIN đó' })
  async resetPin(@Body() dto: ResetPinDto): Promise<void> {
    await this.auth.resetPin(dto);
  }

  @Post('login/google')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng Google id_token' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async loginGoogle(
    @Body() dto: OauthLoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponseDto> {
    const { token, refreshToken, me } = await this.auth.loginGoogle(dto);
    this.setCookie(res, token);
    return { me, token, refreshToken };
  }

  /**
   * Đổi refresh lấy access mới. @Public vì được gọi ĐÚNG LÚC access đã hết hạn —
   * đòi access hợp lệ ở đây thì endpoint mất nghĩa. Refresh token tự nó là bằng
   * chứng, và nó được tra ngược vào DB nên thu hồi được.
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi refresh token lấy access token mới (xoay vòng)' })
  @ApiResponse({ status: 200, type: CustomerRefreshResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh hết hạn, đã dùng, hoặc không tồn tại' })
  async refresh(
    @Body() dto: CustomerRefreshDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<CustomerRefreshResponseDto> {
    const { token, refreshToken } = await this.auth.refresh(dto.refreshToken);
    this.setCookie(res, token);
    return { token, refreshToken };
  }

  /**
   * Xoá cookie VÀ thu hồi refresh của phiên này nếu client gửi kèm. Các máy khác
   * của cùng khách vẫn đăng nhập. Access token 12h vẫn sống tới khi hết hạn —
   * đánh đổi có chủ đích, xem CustomerAuthService.revokeRefresh.
   */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất — xoá cookie customer_token, thu hồi refresh' })
  async logout(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() dto: CustomerLogoutDto,
  ): Promise<void> {
    this.clearCookie(res);
    await this.auth.revokeRefresh(dto?.refreshToken);
  }

  @Get('me')
  @Public()
  @UseGuards(CustomerJwtGuard)
  @ApiOperation({ summary: 'Thông tin khách hàng đang đăng nhập' })
  @ApiResponse({ status: 200, type: CustomerMeDto })
  me(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<CustomerMeDto> {
    return this.auth.me(customer);
  }
}
