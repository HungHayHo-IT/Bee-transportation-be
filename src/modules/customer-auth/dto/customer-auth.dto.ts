import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';

const PIN_PATTERN = /^\d{6}$/;
export const OTP_PURPOSES = ['register', 'reset_pin', 'change_email'] as const;

export class SendOtpDto {
  @ApiProperty() @TrimmedText() @IsEmail() @MaxLength(200)
  email!: string;

  @ApiProperty({ enum: OTP_PURPOSES }) @IsIn(OTP_PURPOSES)
  purpose!: (typeof OTP_PURPOSES)[number];
}

export class VerifyOtpDto {
  @ApiProperty() @TrimmedText() @IsEmail() @MaxLength(200)
  email!: string;

  @ApiProperty({ enum: OTP_PURPOSES }) @IsIn(OTP_PURPOSES)
  purpose!: (typeof OTP_PURPOSES)[number];

  @ApiProperty({ example: '123456' })
  @IsString() @Matches(/^\d{6}$/, { message: 'Mã OTP phải là 6 chữ số' })
  code!: string;
}

/**
 * Không nhận `email` lẫn `otp` nữa — cả hai nằm trong vé. Email do server đọc
 * ra từ vé nên client không thể xác thực hòm mail này rồi mở tài khoản mang
 * tên hòm mail khác; còn OTP thì đã bị đốt ngay lúc /otp/verify.
 */
export class RegisterDto {
  @ApiProperty({ description: 'Vé lấy từ POST /customer-auth/otp/verify (purpose=register)' })
  @IsString()
  ticket!: string;

  @ApiProperty({ example: '123456' })
  @IsString() @Matches(PIN_PATTERN, { message: 'PIN phải là 6 chữ số' })
  pin!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  phone?: string;
}

export class LoginPinDto {
  @ApiProperty() @TrimmedText() @IsEmail() @MaxLength(200)
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString() @Matches(PIN_PATTERN, { message: 'PIN phải là 6 chữ số' })
  pin!: string;
}

export class OauthLoginDto {
  @ApiProperty({ description: 'Google id_token / Apple id_token' })
  @IsString() @MinLength(20)
  idToken!: string;
}

export class SendOtpResponseDto {
  @ApiProperty() ok!: true;
  @ApiProperty({ description: 'Giây trước khi được gửi mã kế tiếp' }) resendAfter!: number;
}

export class CheckEmailDto {
  @ApiProperty() @TrimmedText() @IsEmail() @MaxLength(200)
  email!: string;
}

export class CheckEmailResponseDto {
  @ApiProperty() exists!: boolean;
  @ApiProperty({
    description: 'Danh sách provider đã liên kết (chỉ có khi exists=true)',
    type: [String], example: ['email', 'google'],
  })
  providers!: string[];
  @ApiProperty({ description: 'Đã xác thực email chưa' })
  emailVerified!: boolean;
  /**
   * Cờ RIÊNG chứ không gộp vào một enum với `exists`: một email có thể vừa là
   * nhân viên vừa là khách (nhân viên công ty cũng có thể là khách hàng), enum
   * sẽ buộc phải chọn một và làm mất đường của FE. Ở cổng khách nên chuyển sang
   * màn đăng nhập nội bộ khi `exists = false` VÀ `isStaff = true`.
   */
  @ApiProperty({
    description:
      'Email này là tài khoản nhân viên nội bộ đang hoạt động. Nhân viên đã bị '
      + 'khoá trả về false — cờ này để điều hướng tới màn hình đăng nhập DÙNG ĐƯỢC.',
  })
  isStaff!: boolean;
}

export class CustomerMeDto {
  @ApiProperty() id!: number;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  /**
   * null = chưa có ảnh, FE vẽ chữ cái đầu của tên. Luôn có mặt trong response
   * (không bao giờ undefined) để client phân biệt được "chưa đặt ảnh" với
   * "server cũ chưa biết trường này".
   */
  @ApiProperty({ type: String, nullable: true, description: 'URL công khai của ảnh đại diện' })
  avatarUrl!: string | null;
  @ApiProperty() hasPin!: boolean;
  @ApiProperty({ type: [String] }) providers!: string[];
}

export class LoginResponseDto {
  @ApiProperty({ type: () => CustomerMeDto }) me!: CustomerMeDto;

  /**
   * Chính là token đang nằm trong cookie `customer_token`, không phải phiên mới.
   * Web cứ dùng cookie httpOnly như cũ; app mobile không đọc được cookie đó nên
   * phải lấy token ở đây để gắn vào header Authorization.
   */
  @ApiProperty({ description: 'JWT y hệt cookie customer_token — cho client không dùng cookie' })
  token!: string;

  /**
   * Access token vẫn 12h; refresh này sống 30 ngày và đổi được access mới ở
   * POST /customer-auth/refresh. Mỗi lần đổi là một refresh MỚI, cái cũ chết
   * ngay — xem src/modules/auth/refresh-token.store.ts.
   */
  @ApiProperty({ description: 'Chuỗi mờ 30 ngày, đổi lấy access mới ở POST /customer-auth/refresh' })
  refreshToken!: string;
}

/**
 * Refresh đi trong BODY chứ không phải cookie, cùng lý do với phía nhân viên:
 * app khách hàng không đọc được cookie httpOnly, và cookie thì trình duyệt gửi
 * kèm mọi request nên phơi token 30 ngày ra khắp nơi + mở đường CSRF. Xem
 * src/modules/auth/dto/auth.dto.ts.
 */
export class CustomerRefreshDto {
  @ApiProperty({ description: 'refreshToken nhận được khi đăng nhập hoặc lần refresh trước' })
  @IsString() @MaxLength(512)
  refreshToken!: string;
}

/** Logout không bắt buộc kèm refresh: web chỉ dùng cookie, không giữ refresh. */
export class CustomerLogoutDto {
  @ApiPropertyOptional({ description: 'Thu hồi đúng phiên này; bỏ trống thì chỉ xoá cookie' })
  @IsOptional() @IsString() @MaxLength(512)
  refreshToken?: string;
}

export class CustomerRefreshResponseDto {
  @ApiProperty() token!: string;
  @ApiProperty() refreshToken!: string;
}

/** Đặt lại PIN khi quên — vé thay cho phiên đăng nhập, không cần login trước. */
export class ResetPinDto {
  @ApiProperty({ description: 'Vé lấy từ POST /customer-auth/otp/verify (purpose=reset_pin)' })
  @IsString()
  ticket!: string;

  @ApiProperty({ example: '123456' })
  @IsString() @Matches(PIN_PATTERN, { message: 'PIN phải là 6 chữ số' })
  newPin!: string;
}

export class VerifyOtpResponseDto {
  @ApiProperty() ok!: true;

  @ApiPropertyOptional({
    description:
      'Chỉ có với purpose register và reset_pin: đưa vé này cho bước cuối '
      + '(/register hoặc /reset-pin). Sống 10 phút.',
  })
  ticket?: string;
}
