import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';
import { REFRESH_TTL_DAYS } from '../refresh-token.helper';

/**
 * Trang Admin (bee-transportation-admin) KHÔNG validate format mật khẩu — Admin
 * và staff nhập gì cũng chấp nhận, chỉ chặn ở giới hạn dung lượng để không bị
 * abuse. Cấp password thật (không rỗng, không quá dài) là trách nhiệm của
 * người đặt/đổi, chứ hệ thống không ép rule.
 *
 * Khách hàng (customer) vẫn ràng buộc PIN 6 số ở CustomerAuthModule — riêng
 * hai domain, không đụng nhau.
 */
const PW_MAX = 256;

export class LoginDto {
  @ApiProperty({ example: 'admin@beetransportation.vn' })
  @TrimmedText() @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiProperty()
  @IsString() @MaxLength(PW_MAX)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString() @MaxLength(PW_MAX)
  currentPassword!: string;

  @ApiProperty()
  @IsString() @MaxLength(PW_MAX)
  newPassword!: string;
}

export class MeResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: Number, nullable: true }) departmentId!: number | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;
  @ApiProperty() canViewCompanyReport!: boolean;
  @ApiProperty() canViewAllOrders!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
}

/**
 * Chỉ riêng /auth/login mới trả `token`, nên tách khỏi MeResponseDto thay vì
 * thêm trường vào đó — /auth/me không có token để trả và cũng không nên trả.
 *
 * Token này CHÍNH LÀ token đang nằm trong cookie, không phải phiên mới: web bỏ
 * qua nó và cứ dùng cookie httpOnly như cũ, còn client không phải trình duyệt
 * (app mobile) thì không có cách nào đọc cookie httpOnly ra nên phải lấy ở đây.
 */
export class LoginResponseDto extends MeResponseDto {
  @ApiProperty({ description: 'JWT y hệt cookie access_token — dành cho client không dùng cookie' })
  token!: string;

  @ApiProperty({ description: `Chuỗi mờ sống ${REFRESH_TTL_DAYS} ngày, đổi lấy access mới ở POST /auth/refresh` })
  refreshToken!: string;
}

/**
 * Refresh token đi trong BODY, không phải cookie. Ba lý do:
 *
 * 1. Người cần nó là app mobile — không có kho cookie httpOnly, nên cookie thì
 *    app không đọc ra được để gửi, y như vấn đề đã phải vá ở access token.
 * 2. Cookie được trình duyệt gửi kèm MỌI request tới domain này, tức refresh
 *    token 30 ngày phơi ra ở mọi endpoint chứ không riêng /auth/refresh. Nằm
 *    trong body thì nó chỉ xuất hiện đúng lúc đổi phiên.
 * 3. Cookie tự động gửi kèm là điều kiện đủ để CSRF nhả ra phiên mới; body thì
 *    trang khác không dựng được request mang đúng nội dung.
 *
 * FE web không bắt buộc dùng: cookie access 12h vẫn chạy y như trước.
 */
export class RefreshDto {
  @ApiProperty({ description: 'refreshToken nhận được ở /auth/login hoặc lần refresh trước' })
  @IsString() @MaxLength(512)
  refreshToken!: string;
}

/** Logout không bắt buộc kèm refresh: web chỉ có cookie và không giữ refresh nào. */
export class LogoutDto {
  @ApiPropertyOptional({ description: 'Thu hồi đúng phiên này; bỏ trống thì chỉ xoá cookie' })
  @IsOptional() @IsString() @MaxLength(512)
  refreshToken?: string;
}

export class RefreshResponseDto {
  @ApiProperty() token!: string;
  @ApiProperty() refreshToken!: string;
}
