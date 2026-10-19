import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min,
} from 'class-validator';
import { MAX_PAGE } from '@/common/dto/pagination.dto';

export class DashboardFilterDto {
  @ApiPropertyOptional({ description: 'Mặc định: đầu năm nay' })
  @IsOptional() @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Mặc định: hôm nay' })
  @IsOptional() @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'Ép hẹp hơn — không bao giờ rộng hơn quyền' })
  @IsOptional() @Type(() => Number) @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Ép hẹp hơn — không bao giờ rộng hơn quyền' })
  @IsOptional() @Type(() => Number) @IsInt()
  userId?: number;
}

export class RevenueFilterDto extends DashboardFilterDto {
  @ApiPropertyOptional({ enum: ['day', 'month', 'quarter'], default: 'month' })
  @IsOptional() @IsIn(['day', 'month', 'quarter'])
  groupBy?: 'day' | 'month' | 'quarter';

  @ApiPropertyOptional({ description: 'true = kèm cùng kỳ năm trước' })
  @IsOptional() @IsBooleanString()
  compare?: string;
}

export class RevenueByFilterDto extends DashboardFilterDto {
  @ApiProperty({
    enum: ['service', 'route', 'customer', 'sale', 'department', 'size'],
    description: '"size" cắt theo khối lượng — xem SIZE_BUCKETS để biết mốc chia',
  })
  @IsIn(['service', 'route', 'customer', 'sale', 'department', 'size'])
  dimension!: 'service' | 'route' | 'customer' | 'sale' | 'department' | 'size';
}

export class DrillFilterDto extends DashboardFilterDto {
  @ApiPropertyOptional({ description: 'Lọc theo một trạng thái (từ phễu)' })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['service', 'route', 'customer', 'sale', 'department', 'size'] })
  @IsOptional() @IsIn(['service', 'route', 'customer', 'sale', 'department', 'size'])
  dimension?: string;

  @ApiPropertyOptional({ description: 'Khóa của điểm dữ liệu được bấm' })
  @IsOptional() @IsString()
  key?: string;

  @ApiPropertyOptional({ description: 'Chỉ đơn đã có doanh thu' })
  @IsOptional() @IsBooleanString()
  revenueOnly?: string;

  // QA-07: front-end gửi ?limit= và bị 400 vì DTO không khai báo. Trần 500 giữ
  // nguyên như bản cũ; nay drill phân trang thật nên có thêm `page` bên dưới.
  @ApiPropertyOptional({ default: 500, maximum: 500, description: 'Số dòng tối đa' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number;

  // Không có trần thì skip = (page - 1) * limit vượt kiểu Int của Prisma
  // (xem doc-comment của MAX_PAGE) và bật 500 — cùng lỗi mà năm điểm gọi
  // khác đã dùng clamp(..., MAX_PAGE) để dập.
  @ApiPropertyOptional({ default: 1, maximum: MAX_PAGE })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE)
  page = 1;
}

// ---------------------------------------------------------------- responses

/** QA-15: /dashboard/workload trả một object hai nhánh, không phải mảng. */
export class WorkloadResponseDto {
  @ApiProperty({ type: () => [WorkloadDto] }) byDepartment!: WorkloadDto[];
  @ApiProperty({ type: () => [WorkloadDto] }) byUser!: WorkloadDto[];
}

export class SummaryDto {
  @ApiProperty({ enum: ['company', 'department', 'personal'] }) scopeLevel!: string;
  @ApiProperty() revenueThisMonth!: number;
  @ApiProperty() revenuePrevMonth!: number;
  @ApiProperty() ordersInRange!: number;
  @ApiProperty() ordersClosed!: number;
  @ApiProperty() ordersDecided!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'null khi chưa có đơn nào ra kết quả' })
  winRate!: number | null;
  @ApiProperty() slaLateCount!: number;
}

export class RevenuePointDto {
  @ApiProperty() period!: string;
  @ApiProperty() orderCount!: number;
  @ApiProperty() revenue!: number;
  @ApiProperty() avgValue!: number;
  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Cùng kỳ năm trước' })
  prevRevenue?: number | null;
}

export class RevenueByDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() orderCount!: number;
  @ApiProperty() revenue!: number;
  @ApiProperty() avgValue!: number;
}

export class FunnelStepDto {
  @ApiProperty() status!: string;
  @ApiProperty() label!: string;
  @ApiProperty() orderCount!: number;
}

export class WinRateDto {
  @ApiProperty() won!: number;
  @ApiProperty() rejected!: number;
  @ApiProperty() decided!: number;
  @ApiProperty({ type: Number, nullable: true }) winRate!: number | null;
  @ApiProperty({ type: [Object], description: 'Phân tích lý do từ chối' })
  reasons!: { reason: string; count: number }[];
}

export class ResponseTimeDto {
  @ApiProperty() departmentId!: number;
  @ApiProperty() departmentName!: string;
  @ApiProperty({ type: Number, nullable: true }) hoursToClaim!: number | null;
  @ApiProperty({ type: Number, nullable: true }) hoursToFirstQuote!: number | null;
  @ApiProperty() lateCount!: number;
}

export class CompetitionDto {
  @ApiProperty() departmentId!: number;
  @ApiProperty() departmentName!: string;
  @ApiProperty() participated!: number;
  @ApiProperty() won!: number;
  @ApiProperty() passed!: number;
  @ApiProperty({ type: Number, nullable: true }) quoteWinRate!: number | null;
}

export class WorkloadDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() orderCount!: number;
  @ApiProperty() openCount!: number;
}

export class AvgOrdersPerDeptDto {
  @ApiProperty({ description: 'Số phòng tham gia trung bình mỗi đơn' })
  avgDepartmentsPerOrder!: number;
}


/**
 * Một dòng trong bảng đánh giá nhân viên.
 *
 * `quotedTotal` là tổng tiền ĐÃ BÁO cho khách, khác `revenue` là tiền thực sự
 * chốt. Chênh lệch giữa hai cột chính là phần đã báo mà không chốt được, và
 * đó mới là thứ đọc ra được chất lượng báo giá.
 */
export class StaffScoreDto {
  @ApiProperty() userId!: number;
  @ApiProperty() fullName!: string;
  @ApiProperty({ description: 'Đơn tạo (sale) hoặc dòng báo giá nhận (pricing)' })
  orderCount!: number;
  @ApiProperty({ description: 'Đơn đã ra kết quả — mẫu số của tỷ lệ chuyển đổi' })
  decidedCount!: number;
  @ApiProperty() closedCount!: number;
  @ApiProperty({ description: 'Tổng tiền đã báo giá (VND)' }) quotedTotal!: number;
  @ApiProperty({ description: 'Doanh thu chốt (VND)' }) revenue!: number;
  @ApiProperty({
    type: Number, nullable: true,
    description: 'Phần trăm. null = chưa có đơn nào ra kết quả, KHÁC với 0%.',
  })
  conversionRate!: number | null;
}

/** Hai bảng đánh giá: người tạo đơn và người nhập giá. */
export class StaffScorecardDto {
  @ApiProperty({ type: [StaffScoreDto], description: 'Người tạo đơn — admin sale' })
  bySale!: StaffScoreDto[];
  @ApiProperty({ type: [StaffScoreDto], description: 'Người nhập giá — pricing' })
  byPricing!: StaffScoreDto[];
}
