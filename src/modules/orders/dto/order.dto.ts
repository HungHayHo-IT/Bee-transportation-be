import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString,
  MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { OrderSource, REJECT_REASONS } from '@/common/enums';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';
import { PROVINCES } from '@/common/reference/provinces';
import { QUANTITY_UNITS } from '@/common/reference/quantity-units';

/**
 * QA-09: khách mới trước đây phải POST /customers rồi mới POST /orders — hai lệnh
 * không cùng giao dịch, đứt giữa chừng là còn lại hồ sơ khách mồ côi.
 */
export class InlineCustomerDto {
  /**
   * De trong voi khach den tu form website: form do chi hoi ten nguoi. Phai co
   * IT NHAT MOT trong hai ten, khong thi sinh ra ho so trang khong ai goi ten
   * duoc — ValidateIf duoi day lo viec do.
   */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  companyName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  contactName?: string;

  @ValidateIf((o: InlineCustomerDto) => !o.companyName?.trim() && !o.contactName?.trim())
  @IsString({ message: 'Phải có tên công ty hoặc tên người liên hệ' })
  readonly atLeastOneName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @TrimmedText() @IsEmail()
  email?: string;
}

export class CreateOrderDto {
  @ApiProperty({ description: 'Dịch vụ — quyết định mã đơn, phòng nhận, bộ mốc' })
  @Type(() => Number) @IsInt()
  serviceId!: number;

  @ApiPropertyOptional({
    description:
      'Dịch vụ con — mang mã phương thức vận chuyển gửi sang OF1-TMS. '
      + 'BẮT BUỘC nếu dịch vụ đã chọn có dịch vụ con đang dùng.',
  })
  @IsOptional() @Type(() => Number) @IsInt()
  serviceChildId?: number;

  @ApiPropertyOptional({ description: 'Khách đã có hồ sơ. Loại trừ nhau với newCustomer.' })
  @IsOptional() @Type(() => Number) @IsInt()
  customerId?: number;

  @ApiPropertyOptional({
    type: InlineCustomerDto,
    description:
      'Khách mới — tạo hồ sơ trong CÙNG giao dịch với đơn. Nếu tên đã tồn tại thì ' +
      'dùng lại hồ sơ cũ chứ không tạo trùng. Loại trừ nhau với customerId.',
  })
  @IsOptional() @ValidateNested() @Type(() => InlineCustomerDto)
  newCustomer?: InlineCustomerDto;

  @ApiPropertyOptional({
    enum: PROVINCES,
    description: 'Tỉnh/thành điểm đi — phải nằm trong danh mục (xem GET /reference/provinces)',
  })
  @IsOptional() @IsString() @MaxLength(100)
  originProvince?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  originAddress?: string;

  @ApiPropertyOptional({ enum: PROVINCES, description: 'Tỉnh/thành điểm đến' })
  @IsOptional() @IsString() @MaxLength(100)
  destinationProvince?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  destinationAddress?: string;

  @ApiPropertyOptional({
    description:
      'Địa điểm đầu tuyến trong danh mục (GET /locations) — để tra giá niêm yết. ' +
      'Bỏ trống thì đơn vẫn tạo được, chỉ là không tra giá tự động: hàng giao tận nơi ' +
      'thì không đi giữa hai kho nào cả.',
  })
  @IsOptional() @Type(() => Number) @IsInt()
  originLocationId?: number;

  @ApiPropertyOptional({ description: 'Địa điểm cuối tuyến — xem originLocationId' })
  @IsOptional() @Type(() => Number) @IsInt()
  destinationLocationId?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  desiredDate?: string;

  @ApiPropertyOptional({ description: 'Khối lượng (kg)' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Thể tích (CBM)' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  volumeCbm?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  packageCount?: number;

  @ApiPropertyOptional({
    description:
      'Đơn vị tính của số kiện khi đẩy sang OF1-TMS — mã trong danh mục '
      + 'GET /reference/quantity-units. Bỏ trống thì đẩy đi dưới dạng PK (Package).',
  })
  @IsOptional() @IsString() @IsIn([...QUANTITY_UNITS.map((u) => u.code)])
  quantityUnit?: string;

  @ApiPropertyOptional({ example: '40' }) @IsOptional() @IsString() @MaxLength(20)
  containerType?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  dimLM?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  dimWM?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  dimHM?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  goodsName?: string;

  @ApiPropertyOptional({ description: 'KHÔNG dùng để so khớp đơn giá tham khảo' })
  @IsOptional() @IsString()
  note?: string;

  @ApiPropertyOptional({ enum: OrderSource })
  @IsOptional() @IsIn(Object.values(OrderSource))
  source?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { declaration_type: 'Nhập kinh doanh', hs_code: '8471.30', docs_ready: true },
    description:
      'Giá trị các trường RIÊNG của dịch vụ. Khóa và kiểu lấy từ ' +
      'GET /services/:id/form-schema — khóa lạ trả 400 chứ không bị bỏ qua âm thầm. ' +
      'Ở PATCH, gửi lên là THAY CẢ CỤM; không gửi là giữ nguyên.',
  })
  @IsOptional() @IsObject()
  serviceData?: Record<string, unknown>;
}

export class UpdateOrderDto extends CreateOrderDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  declare serviceId: number;

  @ApiPropertyOptional({ description: 'BẮT BUỘC khi sửa đơn đã chốt (đặc tả F4)' })
  @IsOptional() @IsString() @MaxLength(1000)
  changeNote?: string;
}

export class CloseOrderDto {
  @ApiPropertyOptional({ description: 'Ghi chú khi chốt' })
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class RejectOrderDto {
  @ApiProperty({ enum: REJECT_REASONS })
  @IsIn(REJECT_REASONS as unknown as string[], { message: 'Lý do từ chối không hợp lệ' })
  rejectReason!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class CancelOrderDto {
  @ApiProperty({ description: 'Bắt buộc — hủy phải có lý do' })
  @TrimmedText() @IsString() @IsNotEmpty({ message: 'Hủy đơn phải kèm lý do' })
  @MaxLength(1000)
  reason!: string;
}
