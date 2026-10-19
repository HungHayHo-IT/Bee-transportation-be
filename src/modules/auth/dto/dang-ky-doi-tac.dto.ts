import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class GuiMaDoiTacDto {
  @ApiProperty({ example: 'an.nguyen@beelogistics.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}

export class KiemMaDoiTacDto {
  @ApiProperty({ example: 'an.nguyen@beelogistics.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiProperty({ example: '123456', description: 'Mã 6 số gửi tới hộp thư' })
  @IsString() @Matches(/^\d{6}$/, { message: 'Mã phải là 6 chữ số' })
  code!: string;
}

export class TaoTaiKhoanDoiTacDto {
  @ApiProperty({ description: 'Vé nhận được sau khi nhập đúng mã' })
  @IsString() @MinLength(10)
  ticket!: string;

  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsString() @MaxLength(120)
  fullName!: string;

  /* Cùng độ dài tối thiểu với mật khẩu nhân viên. Đây là tài khoản đăng nhập
     vào admin, không phải PIN 6 số của cổng khách — đặt chuẩn thấp hơn chỉ vì
     người dùng ở công ty khác là tự mở một cửa yếu hơn vào cùng một toà nhà. */
  @ApiProperty({ minLength: 8 })
  @IsString() @Length(8, 72)
  password!: string;
}

export class VeDoiTacDto {
  @ApiProperty() ticket!: string;
}

export class GuiMaDoiTacKetQuaDto {
  @ApiProperty({ description: 'Số giây phải chờ trước khi xin mã lần nữa' })
  resendAfter!: number;
}

export class TaoTaiKhoanDoiTacKetQuaDto {
  @ApiProperty() email!: string;
}
