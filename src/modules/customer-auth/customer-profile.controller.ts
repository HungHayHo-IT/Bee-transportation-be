import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '@/common/decorators/current-customer.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { FastifyReply } from 'fastify';
import { CustomerJwtGuard } from '@/common/guards/customer-jwt.guard';
import { clamp, MAX_PAGE, PageResult } from '@/common/dto/pagination.dto';
import { CUSTOMER_COOKIE } from '@/common/strategies/customer-jwt.strategy';
import { AuthenticatedCustomer } from '@/common/types/authenticated-customer.type';
import {
  ChangePinDto, LinkProviderResponseDto, PresignAvatarDto, PresignAvatarResponseDto,
  RegisterDeviceDto, SetAvatarDto, SetPinByOtpDto, UnregisterDeviceDto, UpdateProfileDto,
} from './dto/profile.dto';
import { CustomerAvatarService } from './customer-avatar.service';
import { CustomerMeDto, OauthLoginDto } from './dto/customer-auth.dto';
import {
  CustomerNotificationDto, MarkCustomerReadDto, SetPushOffDto,
} from './dto/customer-notification.dto';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerProfileService } from './customer-profile.service';

/**
 * Trang tài khoản của khách. Tất cả cần cookie khách hàng — dùng
 * @Public()+@UseGuards(CustomerJwtGuard) để bypass staff guard toàn cục.
 */
@ApiTags('Customer Profile')
@Controller('customer-auth/me')
@Public()
@UseGuards(CustomerJwtGuard)
export class CustomerProfileController {
  constructor(
    private readonly profile: CustomerProfileService,
    private readonly notifications: CustomerNotificationsService,
    private readonly avatar: CustomerAvatarService,
  ) {}

  /**
   * Trả 200 kèm hồ sơ chứ không 204: FE cần trạng thái sau khi sửa để vẽ lại
   * ngay, trả rỗng là bắt họ gọi thêm GET /customer-auth/me cho cùng một việc.
   */
  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đổi tên và số điện thoại',
    description: 'Trả về hồ sơ SAU khi cập nhật — không cần gọi lại GET /customer-auth/me.',
  })
  @ApiResponse({ status: 200, type: CustomerMeDto })
  update(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: UpdateProfileDto,
  ): Promise<CustomerMeDto> {
    return this.profile.updateProfile(c.id, dto);
  }

  /* ------------------------------------------------------------- Ảnh đại diện */

  /**
   * Byte KHÔNG đi qua API: server chỉ ký một URL, client PUT thẳng lên S3 rồi
   * gọi PUT /customer-auth/me/avatar với `key` nhận được. Cùng lối với ảnh của
   * news — ảnh đại diện là ảnh công khai, cho API làm trạm trung chuyển chỉ tốn
   * băng thông mà không kiểm soát thêm được gì.
   *
   * Chủ ảnh lấy từ phiên đăng nhập, nên key sinh ra đã mang sẵn đúng id đó.
   */
  @Post('avatar/presign')
  @ApiOperation({
    summary: 'Xin URL ký sẵn để tải ảnh đại diện lên (3 bước)',
    description:
      '1) Gọi endpoint này. 2) PUT file lên `uploadUrl` kèm đúng `headers`. '
      + '3) Gọi PUT /customer-auth/me/avatar với `key`. Chỉ nhận JPG/PNG/WEBP/GIF.',
  })
  @ApiResponse({ status: 201, type: PresignAvatarResponseDto })
  @ApiResponse({ status: 400, description: 'Sai định dạng ảnh, hoặc S3 chưa được cấu hình' })
  presignAvatar(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: PresignAvatarDto,
  ): Promise<PresignAvatarResponseDto> {
    return this.avatar.presign(c.id, dto.filename, dto.contentType);
  }

  /** Trả cả hồ sơ như PATCH /me để FE vẽ lại bằng đúng một response. */
  @Put('avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lưu ảnh đại diện vừa tải lên',
    description: 'Nhận `key` của bước presign — key của khách khác bị từ chối 400.',
  })
  @ApiResponse({ status: 200, type: CustomerMeDto })
  setAvatar(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: SetAvatarDto,
  ): Promise<CustomerMeDto> {
    return this.avatar.setAvatar(c.id, dto.key);
  }

  @Delete('avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gỡ ảnh đại diện — app quay lại vẽ chữ cái đầu của tên' })
  @ApiResponse({ status: 200, type: CustomerMeDto })
  clearAvatar(@CurrentCustomer() c: AuthenticatedCustomer): Promise<CustomerMeDto> {
    return this.avatar.clearAvatar(c.id);
  }

  /**
   * Xoá thật, không hoàn tác được. Xoá xong phải clear cookie luôn: bỏ sót thì FE
   * còn giữ customer_token trỏ tới id đã chết và mọi request sau đó 401 khó hiểu.
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xoá tài khoản của tôi — xoá thật khỏi DB, không hoàn tác được',
    description:
      'Liên kết Google/Apple xoá theo. Yêu cầu báo giá cũ vẫn ở lại cho Sale '
      + 'nhưng mất liên kết tài khoản. Đơn hàng không bị ảnh hưởng. Cookie được clear.',
  })
  @ApiResponse({ status: 204, description: 'Đã xoá, cookie customer_token đã bị clear' })
  async deleteMe(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<void> {
    await this.profile.deleteAccount(c.id);
    void res.clearCookie(CUSTOMER_COOKIE, { path: '/' });
  }

  @Post('change-pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đổi PIN (biết PIN cũ)' })
  async changePin(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: ChangePinDto,
  ): Promise<void> {
    await this.profile.changePin(c.id, dto);
  }

  @Post('set-pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt/đổi PIN dùng OTP (quên PIN cũ hoặc login qua OAuth)',
    description: 'Gọi /otp/send với purpose "reset_pin" trước.',
  })
  async setPinByOtp(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: SetPinByOtpDto,
  ): Promise<void> {
    await this.profile.setPinByOtp(c.id, dto);
  }

  @Post('link/google')
  @ApiOperation({ summary: 'Liên kết tài khoản Google' })
  @ApiResponse({ status: 201, type: LinkProviderResponseDto })
  linkGoogle(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: OauthLoginDto,
  ): Promise<LinkProviderResponseDto> {
    return this.profile.linkGoogle(c.id, dto.idToken);
  }

  /* ------------------------------------------- Thiết bị nhận push (FCM token) */

  /**
   * Gọi sau khi đăng nhập, và gọi lại mỗi lần app mở / FCM rotate token —
   * endpoint idempotent nên cứ gọi lại thoải mái, không sinh dòng trùng.
   */
  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đăng ký / làm mới FCM token của thiết bị hiện tại',
    description:
      'Idempotent theo fcmToken. Token đang thuộc khách khác (cùng máy, đổi người '
      + 'đăng nhập) sẽ được chuyển sang khách đang gọi để máy đó thôi nhận push của '
      + 'chủ cũ. Chưa gửi push — endpoint này chỉ lưu token.',
  })
  async registerDevice(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.profile.registerDevice(c.id, dto);
  }

  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Huỷ FCM token của thiết bị — gọi kèm lúc logout',
    description: 'Token không tồn tại hoặc của khách khác thì vẫn trả 204, không 404.',
  })
  async unregisterDevice(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: UnregisterDeviceDto,
  ): Promise<void> {
    await this.profile.unregisterDevice(c.id, dto.fcmToken);
  }

  /* ---------------------------------------------------------- Hộp thư khách */

  @Get('notifications')
  @ApiOperation({ summary: 'Hộp thư thông báo của khách' })
  inbox(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Query('isRead') isRead?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<CustomerNotificationDto>> {
    return this.notifications.inbox(
      c.id,
      isRead === undefined ? undefined : isRead === 'true',
      clamp(page, 1, 1, MAX_PAGE),
      clamp(limit, 20, 1, 100),
    );
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: 'Badge số thông báo chưa đọc' })
  unreadCount(@CurrentCustomer() c: AuthenticatedCustomer): Promise<{ count: number }> {
    return this.notifications.unreadCount(c.id);
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu đã đọc' })
  markRead(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: MarkCustomerReadDto,
  ): Promise<{ updated: number }> {
    return this.notifications.markRead(c.id, dto.ids, dto.all);
  }

  @Get('push-preferences')
  @ApiOperation({ summary: 'Loại thông báo đang tắt push' })
  getPushOff(@CurrentCustomer() c: AuthenticatedCustomer): Promise<{ pushOff: string[] }> {
    return this.notifications.getPushOff(c.id);
  }

  @Put('push-preferences')
  @ApiOperation({ summary: 'Đặt loại thông báo tắt push' })
  setPushOff(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Body() dto: SetPushOffDto,
  ): Promise<{ pushOff: string[] }> {
    return this.notifications.setPushOff(c.id, dto.pushOff);
  }

  @Delete('link/:provider')
  @ApiOperation({ summary: 'Huỷ liên kết provider (Google/Apple)' })
  @ApiResponse({ status: 200, type: LinkProviderResponseDto })
  unlink(
    @CurrentCustomer() c: AuthenticatedCustomer,
    @Param('provider') provider: string,
  ): Promise<LinkProviderResponseDto> {
    return this.profile.unlinkProvider(c.id, provider);
  }
}
