import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PIN_PATTERN = /^\d{6}$/;

/** Khớp CHECK constraint của customer_devices.platform. */
export const DEVICE_PLATFORMS = ['web', 'android', 'ios'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  phone?: string;
}

export class ChangePinDto {
  @ApiProperty({ example: '123456' })
  @IsString() @Matches(PIN_PATTERN, { message: 'PIN cũ phải là 6 chữ số' })
  oldPin!: string;

  @ApiProperty({ example: '654321' })
  @IsString() @Matches(PIN_PATTERN, { message: 'PIN mới phải là 6 chữ số' })
  newPin!: string;
}

export class SetPinByOtpDto {
  @ApiProperty({ example: '123456' })
  @IsString() @Matches(/^\d{6}$/, { message: 'Mã OTP phải là 6 chữ số' })
  otp!: string;

  @ApiProperty({ example: '654321' })
  @IsString() @Matches(PIN_PATTERN, { message: 'PIN mới phải là 6 chữ số' })
  newPin!: string;
}

export class LinkProviderResponseDto {
  @ApiProperty() ok!: true;
  @ApiProperty({ type: [String] }) providers!: string[];
}

export class RegisterDeviceDto {
  /**
   * Token FCM thực tế dài ~150-180 ký tự; chặn trên 512 để body rác không trôi
   * vào DB, chặn dưới 20 để loại chuỗi rỗng và giá trị placeholder của FE.
   */
  @ApiProperty({ description: 'Registration token lấy từ Firebase SDK phía client' })
  @IsString() @MinLength(20) @MaxLength(512)
  fcmToken!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  @IsIn(DEVICE_PLATFORMS)
  platform!: DevicePlatform;
}

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'Token cần huỷ — thường gọi kèm lúc logout' })
  @IsString() @MinLength(20) @MaxLength(512)
  fcmToken!: string;
}

/**
 * Bước 1 của luồng đổi ảnh đại diện. `contentType` được KIỂM ở server chứ không
 * chỉ ở đây: client nào cũng gửi được chuỗi tuỳ ý, và chuỗi đó là thứ đi vào
 * chữ ký S3 nên nó quyết định file nằm trên bucket được phục vụ với kiểu gì.
 */
export class PresignAvatarDto {
  @ApiProperty({ example: 'avatar.png', description: 'Tên file gốc — chỉ dùng để lấy đuôi' })
  @IsString() @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'image/png', enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] })
  @IsString() @MaxLength(100)
  contentType!: string;
}

/**
 * Bước 3: client PUT xong thì báo về bằng KEY, không phải URL. Nhận URL tự do
 * là cho phép trỏ ảnh đại diện sang máy chủ bất kỳ; key thì server tự dựng URL
 * và tự kiểm nó có thuộc khách đang gọi không.
 */
export class SetAvatarDto {
  @ApiProperty({ description: 'Đúng chuỗi `key` nhận được ở bước /me/avatar/presign' })
  @IsString() @MaxLength(300)
  key!: string;
}

export class PresignAvatarResponseDto {
  @ApiProperty({ description: 'Gửi lại ở bước PUT /customer-auth/me/avatar' }) key!: string;
  @ApiProperty({ description: 'PUT thẳng byte lên đây, KHÔNG kèm cookie' }) uploadUrl!: string;
  @ApiProperty({ description: 'URL đọc công khai sau khi upload xong' }) publicUrl!: string;
  @ApiProperty({ example: 'PUT' }) method!: 'PUT';
  @ApiProperty({ description: 'Phải gửi y hệt khi PUT, lệch là S3 trả 403' })
  headers!: Record<string, string>;
  @ApiProperty({ description: 'Số giây uploadUrl còn dùng được' }) expiresIn!: number;
}
