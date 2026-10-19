import {
  Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Post, Put, Query, Sse,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SkipEnvelope } from '@/common/decorators/skip-envelope.decorator';
import { clamp, MAX_PAGE, onePage, PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import {
  MarkReadDto, NotifPrefsDto, NotificationDto, NotificationPageDto, RegisterStaffDeviceDto,
  SetPreferencesDto, TaskDto, TaskPageDto, UnregisterStaffDeviceDto,
} from './dto/notification.dto';
import { NotificationEvents, StreamFrame } from './notification-events.service';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications (F8)')
@Controller('notifications')
/* Cả controller thuộc màn Thông báo, TRỪ 'my-tasks' — đó là dữ liệu của màn
   "Việc của tôi", một màn khác trong ma trận. Gộp chung thì bỏ quyền Thông báo
   là mất luôn màn Việc của tôi. */
@Trang('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly events: NotificationEvents,
  ) {}

  /**
   * Luồng đẩy thông báo tức thì. Xác thực đi qua cookie httpOnly như mọi route
   * khác — EventSource tự gửi cookie, không cần token trên URL.
   *
   * @SkipEnvelope BẮT BUỘC: vỏ { success, data } bọc quanh từng khung SSE là hỏng
   * giao thức. Client vẫn phải poll dự phòng, luồng này có thể bị proxy chặn.
   */
  @Sse('stream')
  @SkipEnvelope()
  // Tắt buffer ở proxy: nginx/Vercel giữ luồng lại thì realtime chết âm thầm,
  // client chỉ thấy kết nối treo chứ không thấy lỗi.
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  @ApiOperation({
    summary: 'Luồng SSE thông báo tức thì',
    description: 'text/event-stream. Nhịp tim mỗi 25 giây giữ kết nối và báo còn sống.',
  })
  stream(@CurrentUser() user: AuthenticatedUser): Observable<StreamFrame> {
    return this.events.streamFor(user.id);
  }

  @Get()
  @ApiOperation({
    summary: 'Hộp thư in-app',
    description: 'Trả vỏ phân trang { items, total, page, limit } giống /orders.',
  })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiOkResponse({ type: NotificationPageDto })
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query('isRead') isRead?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<NotificationDto>> {
    return this.notificationsService.inbox(
      user,
      isRead === undefined ? undefined : isRead === 'true',
      clamp(page, 1, 1, MAX_PAGE),
      clamp(limit, 20, 1, 100),
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Badge số thông báo chưa đọc' })
  @ApiResponse({ status: 200 })
  unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    return this.notificationsService.unreadCount(user);
  }

  @Get('my-tasks')
  @Trang('myTasks')
  @ApiOperation({ summary: 'Việc của tôi — đơn đang chờ chính mình hành động' })
  @ApiResponse({ status: 200, type: TaskPageDto })
  async myTasks(@CurrentUser() user: AuthenticatedUser): Promise<PageResult<TaskDto>> {
    return onePage(await this.notificationsService.myTasks(user));
  }

  @Post('read')
  @ApiOperation({ summary: 'Đánh dấu đã đọc' })
  @ApiResponse({ status: 201 })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkReadDto,
  ): Promise<{ updated: number }> {
    return this.notificationsService.markRead(user, dto.ids, dto.all);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Loại thông báo đang tắt email / tắt push' })
  @ApiOkResponse({ type: NotifPrefsDto })
  getPreferences(@CurrentUser() user: AuthenticatedUser): Promise<NotifPrefsDto> {
    return this.notificationsService.getPreferences(user);
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Đặt loại thông báo tắt email / tắt push',
    description: 'pushOff là tuỳ chọn — bỏ trống thì giữ nguyên, không xoá.',
  })
  @ApiOkResponse({ type: NotifPrefsDto })
  setPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPreferencesDto,
  ): Promise<NotifPrefsDto> {
    return this.notificationsService.setPreferences(user, dto);
  }

  /* ------------------------------------------- Thiết bị nhận push (FCM token) */

  /**
   * Đường tương đương POST /customer-auth/me/devices nhưng cho nhân viên, và đặt
   * ở đây chứ không ở module auth: nó thuộc về thông báo, cùng chỗ với
   * /notifications/preferences.
   *
   * Gọi sau khi đăng nhập và gọi lại mỗi lần app mở / FCM xoay token — idempotent
   * nên cứ gọi lại thoải mái.
   */
  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đăng ký / làm mới FCM token của thiết bị hiện tại',
    description:
      'Idempotent theo fcmToken. Token đang thuộc người khác (cùng máy, đổi người '
      + 'đăng nhập) sẽ được chuyển sang người đang gọi để máy đó thôi nhận thông '
      + 'báo của chủ cũ; token đó cũng được gỡ khỏi phía khách hàng.',
  })
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterStaffDeviceDto,
  ): Promise<void> {
    await this.notificationsService.registerDevice(user, dto);
  }

  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Huỷ FCM token của thiết bị — gọi kèm lúc đăng xuất',
    description: 'Token không tồn tại hoặc của người khác thì vẫn trả 204, không 404.',
  })
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UnregisterStaffDeviceDto,
  ): Promise<void> {
    await this.notificationsService.unregisterDevice(user, dto.fcmToken);
  }
}
