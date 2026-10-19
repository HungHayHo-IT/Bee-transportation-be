import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedDto } from '@/common/dto/pagination.dto';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';

export class CreateCustomerDto {
  @ApiProperty() @IsString() @MaxLength(300)
  companyName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  contactName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @TrimmedText() @IsEmail()
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  note?: string;

  // Hai o duoi KHONG bat buoc: khach le va khach den tu form website khong co
  // ma so thue lan giay phep kinh doanh. Ep bat buoc la chan luon duong do.
  @ApiPropertyOptional({ description: 'Mã số thuế — không bắt buộc' })
  @IsOptional() @IsString() @MaxLength(20)
  taxCode?: string;

  @ApiPropertyOptional({ description: 'Số giấy phép kinh doanh — không bắt buộc' })
  @IsOptional() @IsString() @MaxLength(100)
  businessLicence?: string;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  declare companyName: string;
}

export class CustomerResponseDto {
  @ApiProperty() id!: number;

  @ApiProperty({
    type: String, nullable: true,
    description: 'Mã khách bên hệ thống cũ (CL000001..). Trống với khách chưa có mã.',
  })
  code!: string | null;

  // Trong voi khach den tu form website — ho chi de lai ten nguoi lien he.
  @ApiProperty({ type: String, nullable: true }) companyName!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactName!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  status!: string;
  @ApiProperty({ type: String, nullable: true }) taxCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) businessLicence!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Chỉ có khi bị từ chối' })
  rejectReason!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Tên người đã duyệt hoặc từ chối' })
  reviewedByName!: string | null;

  @ApiProperty({
    description:
      'Khách là người của Bee Logistics, nhận ra qua tên miền email @beelogistics.com. '
      + 'SUY RA từ email chứ không lưu — đổi email thì cờ này đổi theo.',
  })
  laBeeLogs!: boolean;
}

export class CustomerDetailResponseDto extends CustomerResponseDto {
  @ApiProperty({ description: 'Số đơn trong phạm vi quyền của người gọi' })
  orderCount!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'null khi người gọi ở tầng cá nhân' })
  totalRevenue!: number | null;
}

export class CustomerPageDto extends PagedDto(CustomerResponseDto) {}
