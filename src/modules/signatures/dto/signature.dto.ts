import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MaxLength, Matches } from 'class-validator';

export class KyDto {
  @ApiProperty({ description: 'Mã OTP 6 số gửi tới email khách' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã xác thực gồm 6 chữ số' })
  otp!: string;

  @ApiProperty({ description: 'Ảnh chữ ký PNG, dạng data URL hoặc base64 trần' })
  @IsString()
  /* Trần một mégabyte: một nét ký vẽ trên canvas nặng vài chục kB, nên trần này
     rộng rãi mà vẫn chặn một request cố tình nhồi. */
  @MaxLength(1_400_000, { message: 'Ảnh chữ ký quá lớn' })
  anhKyBase64!: string;

  @ApiProperty({ description: 'Họ tên người ký, in trên trang chữ ký' })
  @IsString()
  @Length(2, 120)
  tenNguoiKy!: string;
}

export class TuChoiDto {
  @ApiProperty({ description: 'Lý do từ chối — sale cần biết để còn thương lượng tiếp' })
  @IsString()
  @Length(3, 500)
  lyDo!: string;
}

export class XemKyDto {
  @ApiProperty() maDon!: string;
  @ApiProperty() tenKhach!: string;
  @ApiProperty() dieuKhoan!: string;
  @ApiProperty() trangThai!: string;
  @ApiProperty() kyDuoc!: boolean;
  @ApiPropertyOptional({ description: 'Vì sao không ký được' })
  @IsOptional()
  vi?: string;
  @ApiProperty({ description: 'Email đã che, đủ để khách nhận ra mình' })
  emailAn!: string;
}

export class TrangThaiKyDto {
  @ApiProperty() id!: number;
  @ApiProperty({ description: 'cho_ky | da_ky | tu_choi | het_han' }) trangThai!: string;
  @ApiProperty() hetHanLuc!: Date;
  @ApiPropertyOptional({ type: Date, nullable: true }) kyLuc!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) kyTen!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) lyDoTuChoi!: string | null;
  @ApiProperty() createdAt!: Date;
}
