import {
  Body, Controller, Get, HttpCode, HttpStatus, Post, Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { SkipPasswordCheck } from '@/common/decorators/skip-password-check.decorator';
import { sessionCookieOptions } from '@/common/cookies/session-cookie';
import { ACCESS_COOKIE } from '@/common/strategies/jwt.strategy';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto, LoginDto, LoginResponseDto, LogoutDto, MeResponseDto,
  RefreshDto, RefreshResponseDto,
} from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Đăng nhập — đặt cookie httpOnly' })
  @ApiResponse({ status: 201, type: LoginResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<LoginResponseDto> {
    const { token, refreshToken, me } = await this.authService.login(dto.email, dto.password);
    res.setCookie(ACCESS_COOKIE, token, sessionCookieOptions(this.config));
    // Cùng một token ở hai chỗ: cookie cho web, body cho client không đọc được
    // cookie httpOnly. Không sinh phiên thứ hai.
    return { ...me, token, refreshToken };
  }

  /**
   * Access token vẫn 12h. Hết hạn thì trước đây là đăng xuất thẳng, app mobile
   * không có đường nào tránh; giờ đổi refresh (30 ngày) lấy cặp token mới.
   *
   * @Public vì gọi đúng lúc access token đã hết hạn — bắt xác thực bằng chính
   * cái vừa hết hạn thì endpoint này vô dụng. Refresh token TỰ NÓ là bằng chứng
   * xác thực, và nó được tra ngược lại DB nên không tự chứng minh suông.
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đổi refresh token lấy access token mới (xoay vòng)' })
  @ApiResponse({ status: 200, type: RefreshResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh hết hạn, đã dùng, hoặc không tồn tại' })
  async refresh(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<RefreshResponseDto> {
    const { token, refreshToken } = await this.authService.refresh(dto.refreshToken);
    // Đặt lại cookie luôn: client dùng cookie mà có giữ refresh thì cũng gia hạn
    // được phiên, không phải chỉ app mobile mới hưởng.
    res.setCookie(ACCESS_COOKIE, token, sessionCookieOptions(this.config));
    return { token, refreshToken };
  }

  /**
   * Xoá cookie VÀ thu hồi refresh token của phiên này, nếu client có gửi kèm.
   * Không thu hồi refresh của các máy khác: đăng xuất một máy không nên đá văng
   * người dùng khỏi những máy còn lại.
   *
   * Access token 12h vẫn sống tới khi hết hạn — đánh đổi có chủ đích, xem
   * AuthService.revokeRefresh.
   */
  @Post('logout')
  @SkipPasswordCheck()
  @ApiOperation({ summary: 'Đăng xuất — xóa cookie, thu hồi refresh token của phiên' })
  @ApiResponse({ status: 201 })
  async logout(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() dto: LogoutDto,
  ): Promise<{ ok: true }> {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    await this.authService.revokeRefresh(dto?.refreshToken);
    return { ok: true };
  }

  @Get('me')
  @SkipPasswordCheck()
  @ApiOperation({ summary: 'Hồ sơ người đang đăng nhập' })
  @ApiResponse({ status: 200, type: MeResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    return this.authService.me(user);
  }

  @Post('change-password')
  @SkipPasswordCheck()
  @ApiOperation({ summary: 'Đổi mật khẩu — tắt cờ mustChangePassword' })
  @ApiResponse({ status: 201 })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    await this.authService.changePassword(user, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }
}
