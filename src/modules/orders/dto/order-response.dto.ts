import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PagedDto } from '@/common/dto/pagination.dto';

export class OrderListItemDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() status!: string;
  @ApiProperty() statusLabel!: string;
  @ApiProperty() serviceCode!: string;
  @ApiProperty() serviceName!: string;
  @ApiProperty({ type: String, nullable: true }) customerName!: string | null;
  @ApiProperty({ type: String, nullable: true }) originProvince!: string | null;
  @ApiProperty({ type: String, nullable: true }) destinationProvince!: string | null;
  @ApiProperty({ type: String, nullable: true, description: "null = đơn khách gửi từ landing, chưa Sale nào nhận" }) saleName!: string | null;
  /** Chua co sale nao dung ten -> moi Sale deu thay va nhan duoc. */
  @ApiProperty() chuaCoSale!: boolean;
  /** Nguon don: 'website' = khach tu gui tu landing. */
  @ApiProperty({ type: String, nullable: true }) source!: string | null;
  @ApiProperty({ type: String, nullable: true }) departmentName!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'null khi người gọi không được xem doanh thu' })
  finalAmount!: number | null;

  @ApiProperty({ type: String, nullable: true }) latestMilestone!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) closedAt!: Date | null;
}

export class OrderDeptDto {
  @ApiProperty() departmentId!: number;
  @ApiProperty() departmentName!: string;
  @ApiProperty() state!: string;
  @ApiProperty({ type: String, nullable: true }) assigneeName!: string | null;
  /** Người đang phụ trách nhập báo giá — chỉ người này gửi được báo giá. */
  @ApiProperty({ type: Number, nullable: true }) assigneeId!: number | null;
  @ApiProperty({ type: String, nullable: true }) passReason!: string | null;
  @ApiProperty({ type: Number, nullable: true }) amount!: number | null;
  @ApiProperty({ type: String, nullable: true }) scopeNote!: string | null;
  @ApiProperty({ type: String, nullable: true }) leadTime!: string | null;
  @ApiProperty({ type: Date, nullable: true }) validUntil!: Date | null;
  @ApiProperty() quoteVersion!: number;
  @ApiProperty({ type: Date, nullable: true }) distributedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) claimedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) lastQuotedAt!: Date | null;
}

export class OrderMilestoneDto {
  @ApiProperty() id!: number;
  @ApiProperty() seq!: number;
  @ApiProperty() name!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: Date, nullable: true }) doneAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) doneByName!: string | null;
}

/** Vỏ phân trang cho bộ mốc tiến độ của một đơn — trả trọn một trang. */
export class OrderMilestonePageDto extends PagedDto(OrderMilestoneDto) {}

export class OrderDetailDto extends OrderListItemDto {
  @ApiProperty({
    type: Number, nullable: true,
    description: 'Giá Sale chốt với khách. null = chưa nhập, hoặc người gọi không được xem',
  })
  salePrice!: number | null;

  // Chi tiết đơn cần id dịch vụ để đọc bộ trường riêng (GET /services/:id/form-schema);
  // danh sách thì không, ở đó mã dịch vụ là đủ.
  @ApiProperty({ description: 'Dùng để tra bộ trường riêng của dịch vụ' })
  serviceId!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Dịch vụ con đã chọn' })
  serviceChildId!: number | null;

  @ApiProperty({ type: String, nullable: true })
  serviceChildName!: string | null;

  @ApiProperty({
    type: String, nullable: true,
    description: 'Mã OF1-TMS của dịch vụ con. null = đơn này KHÔNG đẩy sang TMS được.',
  })
  serviceChildTmsMode!: string | null;

  @ApiProperty({
    type: String, nullable: true,
    description:
      'Mã OF1-TMS thực sự gửi đi: của dịch vụ con nếu có, không thì của dịch vụ cha. '
      + 'null = đơn này KHÔNG đẩy sang TMS được.',
  })
  tmsMode!: string | null;

  @ApiProperty() orderDay!: Date;
  @ApiProperty() dailyNo!: number;
  @ApiProperty({ type: Number, nullable: true }) customerId!: number | null;
  @ApiProperty({ type: String, nullable: true }) originAddress!: string | null;
  @ApiProperty({ type: String, nullable: true }) destinationAddress!: string | null;
  // Địa điểm đầu tuyến — khoá để tra giá niêm yết. null = đơn chưa khai.
  @ApiProperty({ type: Number, nullable: true }) originLocationId!: number | null;
  @ApiProperty({ type: String, nullable: true }) originLocationName!: string | null;
  @ApiProperty({ type: Number, nullable: true }) destinationLocationId!: number | null;
  @ApiProperty({ type: String, nullable: true }) destinationLocationName!: string | null;
  @ApiProperty({ type: Date, nullable: true }) desiredDate!: Date | null;
  @ApiProperty({ type: Number, nullable: true }) weightKg!: number | null;
  @ApiProperty({ type: Number, nullable: true }) volumeCbm!: number | null;
  @ApiProperty({ type: Number, nullable: true }) packageCount!: number | null;
  @ApiProperty({ type: String, nullable: true }) quantityUnit!: string | null;
  @ApiProperty({ type: String, nullable: true }) containerType!: string | null;
  @ApiProperty({ type: Number, nullable: true }) dimLM!: number | null;
  @ApiProperty({ type: Number, nullable: true }) dimWM!: number | null;
  @ApiProperty({ type: Number, nullable: true }) dimHM!: number | null;
  @ApiProperty({ type: String, nullable: true }) goodsName!: string | null;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: String, nullable: true }) source!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Nhóm lý do khách từ chối (giá / thời gian / ...)' })
  rejectReason!: string | null;

  // Ba cột riêng: client không phải đoán ý nghĩa theo status để đặt nhãn.
  @ApiProperty({ type: String, nullable: true, description: 'Ghi chú lúc CHỐT đơn' })
  closeNote!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Ghi chú lúc khách TỪ CHỐI' })
  rejectNote!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Lý do HỦY đơn' })
  cancelReason!: string | null;

  @ApiProperty({
    type: String, nullable: true,
    description: 'Đẩy sang OF1-TMS. null = chưa đẩy · dang_gui · nhan · tu_choi · khong_ro. '
      + '"khong_ro" nghĩa là chưa biết đơn có vào OF1 hay không — phải đối soát trước khi đẩy lại.',
  })
  tmsStatus!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Lý do OF1 từ chối, hoặc lỗi mạng' })
  tmsError!: string | null;
  @ApiProperty({ type: Date, nullable: true }) completedAt!: Date | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Giá trị các trường riêng của dịch vụ. Nhãn và thứ tự hiển thị lấy từ ' +
      'GET /services/:id/form-schema; ô để trống không có mặt trong object này.',
  })
  serviceData!: Record<string, unknown>;

  // QA-11: cột này trước đây đứng yên mãi mãi; nay có trigger nên phơi ra được để
  // client biết bản đang cầm còn mới hay đã cũ.
  @ApiProperty({ type: Date, description: 'Lần sửa gần nhất (trigger ở DB đặt)' })
  updatedAt!: Date;

  // Định nghĩa "đơn còn thiếu gì" chỉ được có MỘT bản, ở backend. Admin từng tự
  // tính lại để dựng banner và bản đó lệch đi (bỏ tên khách, bỏ số điện thoại, bỏ
  // trường kiểu boolean, coi chuỗi rỗng là đã nhập), nên đơn thiếu mỗi số điện
  // thoại hiện banner với danh sách rỗng.
  @ApiProperty({
    type: [String],
    description:
      'Nhãn các trường còn thiếu, CHỈ tính khi status = awaiting_info; ' +
      'trạng thái khác luôn là mảng rỗng.',
  })
  missingInfo!: string[];

  @ApiPropertyOptional({ type: [OrderDeptDto], description: 'Đã lọc theo luật báo giá kín' })
  departments!: OrderDeptDto[];

  @ApiPropertyOptional({ type: [OrderMilestoneDto] })
  milestones!: OrderMilestoneDto[];
}

/** QA-05: vỏ phân trang của GET /orders trước đây không có trong Swagger. */
export class OrderPageDto extends PagedDto(
  OrderListItemDto,
  'Tổng số đơn khớp bộ lọc, không phải số dòng trang này',
) {}

export class TimelineItemDto {
  @ApiProperty({ type: Date, description: 'Thời điểm xảy ra' }) createdAt!: Date;
  @ApiProperty() action!: string;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({
    type: 'object', additionalProperties: true, nullable: true,
    description: 'Dữ liệu kèm theo, hình dạng tùy action',
  })
  detail!: unknown;
}

export class TimelinePageDto extends PagedDto(TimelineItemDto) {}
