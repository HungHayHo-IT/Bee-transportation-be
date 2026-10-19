import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional,
  IsString, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PageResult } from '@/common/dto/pagination.dto';

/* ------------------------------------------------------------------ địa điểm */

export class CreateLocationDto {
  @ApiProperty({ example: 'Kho Đà Nẵng' })
  @IsString() @IsNotEmpty() @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Đà Nẵng' })
  @IsOptional() @IsString()
  province?: string;

  @ApiPropertyOptional({ example: '12 Nguyễn Văn Linh, Hải Châu' })
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional({
    example: 'BEEDN',
    description: 'Văn phòng phụ trách. Theo VÙNG của địa chỉ, không phải một chiều của giá.',
  })
  @IsOptional() @IsString()
  officeCode?: string;

  @ApiPropertyOptional({
    example: 1042,
    description: 'Id địa điểm trong master data của OF1-TMS. Bee Logistics cấp.',
  })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  of1Id?: number;

  /**
   * Khu vực của bảng giá tuyến (061). Bỏ trống thì suy ra từ tỉnh/thành —
   * ba miền chia sẵn trong migration; tỉnh lạ hoặc không khai tỉnh thì để null.
   */
  @ApiPropertyOptional({ description: 'Khu vực bảng giá. Bỏ trống = suy ra từ tỉnh.' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  regionId?: number;
}

export class UpdateLocationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() province?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional({ example: 'BEEDN' }) @IsOptional() @IsString() officeCode?: string;
  /**
   * Id địa điểm bên OF1-TMS. Gửi null để gỡ.
   *
   * Thiếu nó thì đơn đi qua địa điểm này KHÔNG đẩy sang OF1 được: tài liệu
   * mục 4 bắt buộc cả hai mã địa điểm.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  of1Id?: number | null;
  /**
   * Tắt chứ KHÔNG xoá: địa điểm đã nằm trong một dòng giá của phiên cũ, xoá
   * nó đi là phiên đó mất một đầu tuyến và không tra lại được nữa.
   */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  /** Khu vực bảng giá tuyến. Gửi null để gỡ khỏi mọi khu vực. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  regionId?: number | null;
}

export class LocationResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) province!: string | null;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty({ nullable: true, description: 'Văn phòng phụ trách' })
  officeCode!: string | null;
  @ApiProperty({ nullable: true, description: 'Id địa điểm bên OF1-TMS' })
  of1Id!: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Khu vực bảng giá tuyến' })
  regionId!: number | null;
  @ApiProperty({ type: String, nullable: true }) regionName!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class LocationPageDto implements PageResult<LocationResponseDto> {
  @ApiProperty({ type: [LocationResponseDto] }) items!: LocationResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

/* ------------------------------------------------------------------ phiên giá */

export class CreatePriceSessionDto {
  @ApiProperty({ example: 'Bảng giá Quý 4/2026' })
  @IsString() @IsNotEmpty() @MinLength(2)
  name!: string;

  @ApiProperty({ example: '2026-10-01', description: 'Ngày bắt đầu áp dụng' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;

  /**
   * Chép toàn bộ dòng giá từ một phiên có sẵn.
   *
   * Đây là cách dùng lại một bảng giá cũ — KHÔNG bật lại phiên cũ. Chép để
   * lại ngày tháng, người làm và một dòng riêng trong danh sách phiên; bật
   * lại thì bảng giá quay ngược mà không có dấu vết nào nói vì sao.
   */
  @ApiPropertyOptional({ description: 'Chép dòng giá từ phiên này' })
  @IsOptional() @Type(() => Number) @IsInt()
  copyFromSessionId?: number;
}

export class UpdatePriceSessionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class PriceSessionResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ example: '2026-10-01' }) effectiveFrom!: string;
  @ApiProperty({ enum: ['draft', 'active', 'archived'] }) status!: string;
  @ApiProperty({ nullable: true }) note!: string | null;
  @ApiProperty({ description: 'Số dòng giá trong phiên' }) priceCount!: number;
  @ApiProperty({ description: 'So tuyen cua bang gia khu vuc trong phien nay' })
  routeCount!: number;
  @ApiProperty({ nullable: true }) createdByName!: string | null;
  @ApiProperty({ nullable: true }) activatedAt!: string | null;
}

export class PriceSessionPageDto implements PageResult<PriceSessionResponseDto> {
  @ApiProperty({ type: [PriceSessionResponseDto] }) items!: PriceSessionResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

/* ------------------------------------------------------------------ giá tuyến */

export class CreateRoutePriceDto {
  @ApiProperty() @Type(() => Number) @IsInt() sessionId!: number;
  @ApiProperty() @Type(() => Number) @IsInt() originId!: number;
  @ApiProperty() @Type(() => Number) @IsInt() destinationId!: number;
  @ApiProperty({ example: 'CONT20DC_LE17T', description: 'Mã đơn vị tính — xem GET /price-units' })
  /* @IsNotEmpty: chuỗi rỗng qua được @IsString, rồi chết ở khoá ngoại với một
     câu lỗi Postgres mà người nhập không đọc được. */
  @IsString() @IsNotEmpty()
  unitCode!: string;

  @ApiProperty({ example: 4500000, description: 'Đồng, không lẻ' })
  @Type(() => Number) @IsInt() @Min(0)
  price!: number;

  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateRoutePriceDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class RoutePriceResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() sessionId!: number;
  @ApiProperty() originId!: number;
  @ApiProperty() originName!: string;
  @ApiProperty() destinationId!: number;
  @ApiProperty() destinationName!: string;
  @ApiProperty() unitCode!: string;
  @ApiProperty() unitLabel!: string;
  @ApiProperty({ example: 'FCL' }) unitKind!: string;
  @ApiProperty() price!: number;
  @ApiProperty({ nullable: true }) note!: string | null;
}

export class RoutePricePageDto implements PageResult<RoutePriceResponseDto> {
  @ApiProperty({ type: [RoutePriceResponseDto] }) items!: RoutePriceResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

/** Kết quả một lần nhập file — nói rõ đã bỏ gì, để không im lặng nuốt dòng. */
export class ImportResultDto {
  @ApiProperty({ description: 'Số dòng ghi vào bảng giá' }) imported!: number;
  @ApiProperty({ description: 'Số dòng trùng trong chính file, đã lấy dòng cuối' })
  merged!: number;
  @ApiProperty({ type: [String], description: 'Dòng bị bỏ và lý do' })
  skipped!: string[];

  /**
   * So tuyen da ghi. KHAC `imported`: mot tuyen chua khai gia van duoc ghi,
   * nen `imported` bang 0 ma lan nhap van thanh cong. Thieu con so nay thi
   * giao dien khong phan biet duoc "khong co gi vao" voi "vao roi, chua co
   * gia".
   */
  @ApiPropertyOptional({ description: 'So tuyen da ghi' })
  routes?: number;

  /**
   * Viec he thong da TU LAM trong lan nhap nay — khac han dong bi bo.
   *
   * Vi du: file ghi cot '20DC' ma danh muc chua co don vi tinh nao ten vay,
   * he thong tu them vao danh muc. Nhet chung vao `skipped` thi nguoi doc
   * tuong co dong bi mat, con im lang thi danh muc tu moc them dong moi ma
   * khong ai biet.
   */
  @ApiPropertyOptional({ type: [String], description: 'Viec he thong tu lam khi nhap' })
  notes?: string[];
}


/**
 * Giá niêm yết tra được cho một tuyến, hoặc rỗng.
 *
 * `price` null nghĩa là bảng giá KHÔNG nói gì về tuyến này — khác hẳn với giá
 * bằng 0. Màn báo giá phải phân biệt hai chuyện đó: một bên là "tự điền đi",
 * một bên là "miễn phí".
 */
export class PriceUnitDto {
  @ApiProperty({ example: 'CONT20DC_LE17T' }) code!: string;
  @ApiProperty({ example: "20'DC ≤ 17 tấn" }) label!: string;
  @ApiProperty({ example: 'FCL', description: 'DC -> FCL, tính theo tấn -> LCL' })
  kind!: string;
}

export class ListedUnitPriceDto {
  @ApiProperty() unitCode!: string;
  @ApiProperty() unitLabel!: string;
  @ApiProperty({ example: 'FCL' }) unitKind!: string;
  @ApiProperty() price!: number;
}

/**
 * Giá niêm yết của MỘT tuyến: một dòng cho mỗi đơn vị tính.
 *
 * `units` rỗng = bảng giá không nói gì về tuyến này. Khác hẳn giá bằng 0, và
 * màn báo giá phải nói đúng như thế chứ không điền bừa một con số.
 */
export class ListedPriceDto {
  @ApiProperty({ type: [ListedUnitPriceDto] }) units!: ListedUnitPriceDto[];
  @ApiProperty({ type: Number, nullable: true }) sessionId!: number | null;
  @ApiProperty({ type: String, nullable: true }) sessionName!: string | null;
}

/* --------------------------------------------------- khu vực + tuyến (061) */

export class PriceRegionDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'Miền Trung' }) name!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Trưởng phòng phụ trách. Chỉ người này xem được bảng giá của khu vực.',
  })
  managerId!: number | null;
  @ApiProperty({ type: String, nullable: true }) managerName!: string | null;
  @ApiProperty({ description: 'Số tuyến ĐI TỪ khu vực này' }) routeCount!: number;
  @ApiProperty({ description: 'Số địa điểm đang bật thuộc khu vực này' })
  locationCount!: number;
}

export class SaveRegionDto {
  @ApiProperty({ example: 'Miền Trung' })
  @IsString() @IsNotEmpty() @MinLength(2)
  name!: string;

  /**
   * Trưởng phòng phụ trách. null = chưa giao cho ai, khi đó chỉ Quản trị và
   * Giám đốc xem được khu vực này.
   */
  @ApiPropertyOptional({ nullable: true, description: 'Id Trưởng phòng phụ trách' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  managerId?: number | null;
}

/**
 * Một mức giá: một bậc trọng tải xe trên một dịch vụ của tuyến.
 *
 * Hai giá đều cho phép null nhưng KHÔNG được cùng null — tuyến chỉ chạy một
 * chiều là thật, còn một dòng không có giá nào thì không phải một mức giá.
 * Ràng buộc nằm cả ở DB (`region_route_prices_co_gia_ck`), đây chỉ là lớp trả
 * câu tiếng Việt trước khi Postgres ném tên constraint ra.
 */
export class RegionRoutePriceDto {
  @ApiProperty({
    example: 'TRUCK_1T4',
    description: 'Mã đơn vị tính — cùng danh mục price_units với bảng giá cũ',
  })
  @IsString() @IsNotEmpty()
  unitCode!: string;

  @ApiPropertyOptional({ description: 'Nhãn đơn vị tính. Chỉ có khi ĐỌC.' })
  @IsOptional() @IsString()
  unitLabel?: string;

  @ApiPropertyOptional({ example: 4200000 })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  oneWayPrice?: number | null;

  @ApiPropertyOptional({ example: 7500000 })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  roundTripPrice?: number | null;
}

export class RegionRouteServiceInputDto {
  @ApiProperty({ enum: ['FCL', 'LCL'], description: 'FCL = nguyên container, LCL = hàng lẻ' })
  @IsString() @IsIn(['FCL', 'LCL'])
  kind!: 'FCL' | 'LCL';

  @ApiProperty({ type: [RegionRoutePriceDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RegionRoutePriceDto)
  prices!: RegionRoutePriceDto[];
}

/**
 * Thêm / sửa một tuyến.
 *
 * KHÔNG nhận `regionId` và cũng không nhận tỉnh/thành: khu vực của tuyến là
 * khu vực của ĐỊA ĐIỂM NHẬN, và tỉnh là tỉnh của địa điểm. Nhận thêm chúng từ
 * giao diện là mở đường cho một tuyến ghi "Miền Nam" trong khi kho của nó nằm
 * ở Đà Nẵng — đúng lỗi vừa sửa ở form đơn hàng.
 *
 * `services` thay CẢ danh sách, không vá từng dòng: giao diện gửi lên nguyên
 * trạng những gì đang hiện, nên mọi mức giá bị xoá trên màn hình phải mất thật.
 */
export class SaveRegionRouteDto {
  /**
   * Phien gia de ghi vao. Bo trong = phien dang ap dung, khong co thi phien
   * moi nhat, khong co nua thi he thong tao phien dau tien.
   */
  @ApiPropertyOptional({ description: 'Phien gia. Bo trong = phien dang ap dung.' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  sessionId?: number;

  @ApiProperty() @IsInt() @Min(1) @Type(() => Number) originLocationId!: number;
  @ApiProperty() @IsInt() @Min(1) @Type(() => Number) destinationLocationId!: number;

  /**
   * Quãng đường HAI CHIỀU, km. Thuộc TUYẾN, không thuộc từng mức giá: đoạn
   * đường không đổi theo việc chở bằng xe 1.4T hay container 20DC.
   */
  @ApiPropertyOptional({ example: 620, description: 'Quãng đường HAI CHIỀU, km' })
  @IsOptional() @IsInt() @Min(0) @Type(() => Number)
  roundTripKm?: number | null;

  @ApiProperty({ type: [RegionRouteServiceInputDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => RegionRouteServiceInputDto)
  services!: RegionRouteServiceInputDto[];
}

export class RouteEndpointDto {
  @ApiProperty({ type: String, nullable: true }) province!: string | null;
  @ApiProperty() locationId!: number;
  @ApiProperty() locationName!: string;
}

export class RegionRouteServiceDto {
  @ApiProperty({ enum: ['FCL', 'LCL'] }) kind!: 'FCL' | 'LCL';
  @ApiProperty({ type: [RegionRoutePriceDto] }) prices!: RegionRoutePriceDto[];
}

export class RegionRouteDto {
  @ApiProperty() id!: number;
  @ApiProperty({ description: 'Phien gia chua tuyen nay' }) sessionId!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Quãng đường HAI CHIỀU, km' })
  roundTripKm!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Khu vực của địa điểm NHẬN. null = địa điểm đó chưa gán khu vực.',
  })
  regionId!: number | null;
  @ApiProperty({ type: String, nullable: true }) regionName!: string | null;
  @ApiProperty({ type: RouteEndpointDto }) origin!: RouteEndpointDto;
  @ApiProperty({ type: RouteEndpointDto }) destination!: RouteEndpointDto;
  @ApiProperty({ type: [RegionRouteServiceDto] }) services!: RegionRouteServiceDto[];
}

export class RegionRoutePageDto implements PageResult<RegionRouteDto> {
  @ApiProperty({ type: [RegionRouteDto] }) items!: RegionRouteDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
