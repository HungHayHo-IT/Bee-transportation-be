import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';
import { NotifType } from '@/common/enums';
import { PagedDto } from '@/common/dto/pagination.dto';

export class NotificationDto {
  @ApiProperty() id!: number;
  // QA-24: khai `string` trơn thì client không biết tập giá trị để bắt sự kiện.
  @ApiProperty({ enum: NotifType, enumName: 'NotifType' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) body!: string | null;
  @ApiProperty({ type: Number, nullable: true }) orderId!: number | null;
  @ApiProperty() isRead!: boolean;
  @ApiProperty() createdAt!: Date;
}

/** Vỏ phân trang cho hộp thư — khai báo tường minh để Swagger sinh đúng kiểu. */
export class NotificationPageDto extends PagedDto(
  NotificationDto,
  'Tổng số thông báo khớp bộ lọc',
) {}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @IsInt({ each: true })
  ids?: number[];

  @ApiPropertyOptional({ description: 'true = đánh dấu đọc hết' })
  @IsOptional() @IsBoolean()
  all?: boolean;
}

export class SetPreferencesDto {
  @ApiProperty({ type: [String], description: 'Loại thông báo TẮT email' })
  @IsArray() @IsString({ each: true })
  emailOff!: string[];

  /**
   * Tuỳ chọn, KHÔNG bắt buộc: client cũ chỉ gửi emailOff vẫn phải chạy y như
   * trước. Bỏ trống = giữ nguyên danh sách đang có, không phải xoá hết.
   */
  @ApiPropertyOptional({ type: [String], description: 'Loại thông báo TẮT push' })
  @IsOptional() @IsArray() @IsString({ each: true })
  pushOff?: string[];
}

export class NotifPrefsDto {
  @ApiProperty({ type: [String] }) emailOff!: string[];
  @ApiProperty({ type: [String] }) pushOff!: string[];
}

/**
 * Nền tảng hợp lệ — phải khớp CHECK constraint của user_devices (migration 019).
 * Khai lại ở đây chứ không import từ customer-auth: module thông báo của nhân
 * viên không nên phụ thuộc vào module xác thực khách chỉ vì một hằng số.
 */
export const STAFF_DEVICE_PLATFORMS = ['web', 'android', 'ios'] as const;
export type StaffDevicePlatform = (typeof STAFF_DEVICE_PLATFORMS)[number];

/**
 * Tên có tiền tố `Staff` để không đụng RegisterDeviceDto của khách — Swagger đặt
 * tên schema theo tên class, trùng tên là một trong hai bản bị nuốt.
 */
export class RegisterStaffDeviceDto {
  /**
   * Token FCM thực tế dài ~150-180 ký tự; chặn trên 512 để body rác không trôi
   * vào DB, chặn dưới 20 để loại chuỗi rỗng và giá trị placeholder của FE.
   */
  @ApiProperty({ description: 'Registration token lấy từ Firebase SDK phía client' })
  @IsString() @MinLength(20) @MaxLength(512)
  fcmToken!: string;

  @ApiProperty({ enum: STAFF_DEVICE_PLATFORMS })
  @IsIn(STAFF_DEVICE_PLATFORMS)
  platform!: StaffDevicePlatform;
}

export class UnregisterStaffDeviceDto {
  @ApiProperty({ description: 'Token cần huỷ — thường gọi kèm lúc đăng xuất' })
  @IsString() @MinLength(20) @MaxLength(512)
  fcmToken!: string;
}

export class TaskDto {
  @ApiProperty() orderId!: number;
  @ApiProperty() code!: string;
  @ApiProperty() reason!: string;
  @ApiProperty() since!: Date;
}

/** Vỏ phân trang — việc đang chờ người gọi hành động, trả trọn một trang. */
export class TaskPageDto extends PagedDto(TaskDto) {}
