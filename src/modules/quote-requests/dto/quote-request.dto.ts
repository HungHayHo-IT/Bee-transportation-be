import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength,
} from 'class-validator';
import { SubmittedBy, SUBMITTED_BY_VALUES } from '../submitted-by.helper';
import { PagedDto } from '@/common/dto/pagination.dto';
import { TrimmedText } from '@/common/decorators/trimmed-text.decorator';

export class CreateQuoteRequestDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200)
  customerName!: string;

  /** Số VN: di động 0[35789]xxxxxxxx hoặc cố định 02xxxxxxxxx, nhận cả +84/84.
   *  Bỏ dấu cách, chấm, gạch, ngoặc và đổi +84/84 về 0 TRƯỚC khi kiểm — một số
   *  chỉ có một cách viết, nên giới hạn 3 yêu cầu/số đếm được bằng phép so bằng. */
  @ApiProperty({ example: '0912345678' })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.replace(/[\s.\-()]/g, '').replace(/^\+?84(?=\d{9,10}$)/, '0')
      : value)
  @IsString()
  @Matches(/^0(?:[35789]\d{8}|2\d{9})$/, { message: 'Số điện thoại không đúng định dạng' })
  phone!: string;

  @ApiPropertyOptional() @IsOptional() @TrimmedText() @IsEmail()
  email?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  serviceId?: number;

  /** Nhận từ trang public khi bên gọi không biết id — service tra ra id. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  serviceCode?: string;

  /**
   * Dịch vụ con. BẮT BUỘC khi dịch vụ đã chọn có dòng con đang bật — thiếu thì
   * yêu cầu vẫn lưu được nhưng KHÔNG tự thành đơn, nó nằm lại ở `pending` và
   * không phòng nào nhận. Xem `formFields` của GET /services/public.
   */
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  serviceChildId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  originProvince?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  destinationProvince?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  note?: string;

  /**
   * Token FCM của máy đang gửi form. CHỈ dùng cho khách VÃNG LAI — khách đã đăng
   * nhập thì token của họ nằm ở customer_devices rồi. Không tạo tài khoản tạm:
   * customer_accounts.email là UNIQUE NOT NULL nhưng form này cho bỏ trống email.
   */
  @ApiPropertyOptional({ description: 'FCM token để nhận thông báo khi có báo giá' })
  @IsOptional() @IsString() @MinLength(20) @MaxLength(512)
  fcmToken?: string;
}

export class RejectQuoteRequestDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(500)
  reason!: string;
}

export class QuoteRequestDto {
  @ApiProperty() id!: number;
  @ApiProperty() customerName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: Number, nullable: true }) serviceId!: number | null;
  @ApiProperty({ type: String, nullable: true }) serviceName!: string | null;
  @ApiProperty({ type: String, nullable: true }) originProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) destinationProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ type: Number, nullable: true }) createdById!: number | null;
  @ApiProperty({ type: String, nullable: true }) createdByName!: string | null;
  @ApiProperty({
    enum: SUBMITTED_BY_VALUES,
    description:
      'Nguồn gửi: staff = nhân viên nội bộ nhập hộ (xem createdByName), '
      + 'customer = khách hàng đã đăng nhập tự gửi, anonymous = form public không đăng nhập.',
  })
  submittedBy!: SubmittedBy;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: Number, nullable: true }) reviewedById!: number | null;
  @ApiProperty({ type: String, nullable: true }) reviewedByName!: string | null;
  @ApiProperty({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) convertedToOrderId!: number | null;
  @ApiProperty({ type: String, nullable: true }) rejectReason!: string | null;
}

export class QuoteRequestPageDto extends PagedDto(QuoteRequestDto) {}

/**
 * Giá đã chốt, gửi cho chính khách hàng.
 *
 * Một DTO duy nhất với `amount` nullable + cờ `state`, chứ không tách hai kiểu
 * response riêng cho "có giá"/"chưa có giá": client chỉ phải gọi một chỗ và rẽ
 * nhánh trên đúng một trường, thay vì đoán mình đang cầm hình dạng nào. Cả hai
 * ca đều là 200 — "chưa có giá" là trạng thái bình thường của một yêu cầu vừa
 * gửi, không phải lỗi.
 *
 * Cố tình KHÔNG có: tên phòng thắng, số phòng đã tham gia, giá của phòng thua,
 * tên nhân viên báo giá. Các phòng cạnh tranh giá với nhau là chuyện nội bộ;
 * khách chỉ cần con số và mã đơn để nói chuyện với sale.
 */
export class CustomerQuoteDto {
  @ApiProperty() quoteRequestId!: number;

  @ApiProperty({
    enum: ['pending', 'quoted', 'cancelled'],
    description:
      'pending = chưa có giá (chưa thành đơn, hoặc các phòng còn đang báo giá); '
      + 'quoted = sale đã chọn phòng phụ trách, amount là giá chính thức; '
      + 'cancelled = đơn đã huỷ hoặc bị từ chối, giá cũ không còn hiệu lực.',
  })
  state!: 'pending' | 'quoted' | 'cancelled';

  @ApiProperty({ type: Number, nullable: true, description: 'VND, null khi state = pending' })
  amount!: number | null;

  @ApiProperty({ type: String, nullable: true, description: 'Mã đơn để đối chiếu với sale' })
  orderCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Thời điểm mức giá này được báo' })
  quotedAt!: string | null;
}

export class QuoteRequestCreatedDto {
  @ApiProperty() id!: number;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: string;
}

/**
 * Bản hẹp của QuoteRequestDto, dành cho đường tra cứu CÔNG KHAI.
 *
 * Không dùng lại QuoteRequestDto vì nó mang `createdByName`/`reviewedByName`
 * (họ tên nhân viên nội bộ), `createdById`/`reviewedById` và `submittedBy` —
 * dữ liệu để nhân viên biết ai xử lý, không phải để người lạ chỉ cầm id + số
 * điện thoại đọc được. Tên nhân viên lộ ra là nguyên liệu cho lừa đảo mạo danh
 * ("em là Trần Văn A bên kho, anh chuyển cọc giúp em").
 *
 * `rejectReason` thì ngược lại, vẫn giữ: hệ thống đã chủ động báo lý do từ
 * chối cho chính khách rồi, giấu ở đây chỉ làm khách không hiểu chuyện gì.
 */
export class PublicQuoteRequestDto {
  @ApiProperty() id!: number;
  @ApiProperty() customerName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ type: Number, nullable: true }) serviceId!: number | null;
  @ApiProperty({ type: String, nullable: true }) serviceName!: string | null;
  @ApiProperty({ type: String, nullable: true }) originProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) destinationProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) reviewedAt!: string | null;
  @ApiProperty({ type: Number, nullable: true }) convertedToOrderId!: number | null;
  @ApiProperty({ type: String, nullable: true }) rejectReason!: string | null;
}
