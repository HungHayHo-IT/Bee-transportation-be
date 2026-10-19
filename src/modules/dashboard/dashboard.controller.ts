import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PageResult } from '@/common/dto/pagination.dto';
import { AggregateReportGuard } from '@/common/guards/aggregate-report.guard';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import { OrderListItemDto, OrderPageDto } from '../orders/dto/order-response.dto';
import { DrillService } from './drill.service';
import {
  AvgOrdersPerDeptDto, CompetitionDto, DashboardFilterDto, DrillFilterDto, FunnelStepDto,
  ResponseTimeDto, RevenueByDto, RevenueByFilterDto, RevenueFilterDto, RevenuePointDto,
  StaffScorecardDto, SummaryDto, WinRateDto, WorkloadDto, WorkloadResponseDto,
} from './dto/dashboard.dto';
import { OperationsService } from './operations.service';
import { RevenueService } from './revenue.service';

@ApiTags('Dashboard (F6)')
@Controller('dashboard')
/* Ba màn Bảng điều khiển / Báo cáo doanh thu / Báo cáo vận hành dùng CHUNG
   nhiều endpoint ở đây, nên mỗi endpoint khai đúng những màn thật sự gọi nó và
   chỉ cần MỘT màn cho phép là qua. Khai theo controller thì bỏ quyền một báo
   cáo sẽ tắt luôn bảng điều khiển của mọi người.

   AggregateReportGuard vẫn giữ: nó chặn theo PHẠM VI DỮ LIỆU (ai không có
   phòng ban thì không có báo cáo tổng hợp nào để xem), một luật khác hẳn với
   "vai trò này được vào màn nào". */
export class DashboardController {
  constructor(
    private readonly revenueService: RevenueService,
    private readonly operationsService: OperationsService,
    private readonly drillService: DrillService,
  ) {}

  @Get('summary')
  @Trang('dashboard')
  @ApiOperation({ summary: 'Thẻ số: doanh thu tháng, số đơn, win rate, đơn trễ SLA' })
  @ApiResponse({ status: 200, type: SummaryDto })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<SummaryDto> {
    return this.revenueService.summary(user, f);
  }

  @Get('revenue')
  @Trang('dashboard', 'revenueReport')
  @ApiOperation({ summary: 'Doanh thu theo ngày / tháng / quý, kèm so sánh cùng kỳ' })
  @ApiResponse({ status: 200, type: [RevenuePointDto] })
  revenue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: RevenueFilterDto,
  ): Promise<RevenuePointDto[]> {
    return this.revenueService.revenue(user, f);
  }

  @Get('revenue/by')
  @Trang('dashboard', 'revenueReport')
  @ApiOperation({ summary: 'Lát cắt doanh thu theo dịch vụ / tuyến / khách / sale / phòng' })
  @ApiResponse({ status: 200, type: [RevenueByDto] })
  revenueBy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: RevenueByFilterDto,
  ): Promise<RevenueByDto[]> {
    return this.revenueService.revenueBy(user, f);
  }

  @Get('funnel')
  @Trang('dashboard', 'operationsReport')
  @ApiOperation({ summary: 'Phễu số đơn theo trạng thái' })
  @ApiResponse({ status: 200, type: [FunnelStepDto] })
  funnel(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<FunnelStepDto[]> {
    return this.operationsService.funnel(this.revenueService.narrow(user, f), f);
  }

  @Get('win-rate')
  @Trang('dashboard')
  @ApiOperation({ summary: 'Tỷ lệ chốt + phân tích lý do từ chối' })
  @ApiResponse({ status: 200, type: WinRateDto })
  winRate(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<WinRateDto> {
    return this.operationsService.winRate(this.revenueService.narrow(user, f), f);
  }

  // Ba endpoint so sánh giữa phòng/người: chặn TẦNG CÁ NHÂN, không phải "chỉ tầng
  // công ty" — trưởng phòng phải xem được hiệu suất phòng mình.
  @Get('response-time')
  @Trang('operationsReport')
  @UseGuards(AggregateReportGuard)
  @ApiOperation({ summary: 'Thời gian tiếp nhận / báo giá theo phòng' })
  @ApiResponse({ status: 200, type: [ResponseTimeDto] })
  responseTime(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<ResponseTimeDto[]> {
    return this.operationsService.responseTime(this.revenueService.narrow(user, f), f);
  }

  @Get('competition')
  @Trang('operationsReport')
  @UseGuards(AggregateReportGuard)
  @ApiOperation({ summary: 'Tỷ lệ thắng báo giá theo phòng' })
  @ApiResponse({ status: 200, type: [CompetitionDto] })
  competition(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<CompetitionDto[]> {
    return this.operationsService.competition(this.revenueService.narrow(user, f), f);
  }

  @Get('competition/avg-departments')
  @Trang('operationsReport')
  @UseGuards(AggregateReportGuard)
  @ApiOperation({ summary: 'Số phòng tham gia trung bình mỗi đơn' })
  @ApiResponse({ status: 200, type: AvgOrdersPerDeptDto })
  avgDepartments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<AvgOrdersPerDeptDto> {
    return this.operationsService.avgDepartmentsPerOrder(this.revenueService.narrow(user, f), f);
  }

  @Get('workload')
  @Trang('operationsReport')
  @UseGuards(AggregateReportGuard)
  @ApiOperation({ summary: 'Khối lượng đơn theo phòng và theo nhân viên' })
  @ApiOkResponse({ type: WorkloadResponseDto })
  async workload(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<{ byDepartment: WorkloadDto[]; byUser: WorkloadDto[] }> {
    const s = this.revenueService.narrow(user, f);
    const [byDepartment, byUser] = await Promise.all([
      this.operationsService.workloadByDepartment(s, f),
      this.operationsService.workloadByUser(s, f),
    ]);
    return { byDepartment, byUser };
  }

  @Get('staff-scorecard')
  @Trang('dashboard', 'operationsReport')
  @UseGuards(AggregateReportGuard)
  @ApiOperation({
    summary: 'Bảng đánh giá nhân viên — đơn, tổng báo giá, doanh thu, tỷ lệ chuyển đổi',
    description:
      'Hai bảng: người TẠO đơn (admin sale) và người NHẬP GIÁ (pricing). Tỷ lệ chuyển đổi ' +
      'tính trên đơn ĐÃ RA KẾT QUẢ, không trên tổng đơn — đơn còn đang chạy mà đếm vào mẫu ' +
      'số thì tỷ lệ của mọi người tụt xuống đúng theo tốc độ họ nhận việc mới.',
  })
  @ApiOkResponse({ type: StaffScorecardDto })
  async staffScorecard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DashboardFilterDto,
  ): Promise<StaffScorecardDto> {
    const s = this.revenueService.narrow(user, f);
    const [bySale, byPricing] = await Promise.all([
      this.operationsService.scorecardBySale(s, f),
      this.operationsService.scorecardByPricing(s, f),
    ]);
    return { bySale, byPricing };
  }

  @Get('drill')
  @Trang('dashboard')
  @ApiOperation({
    summary: 'Danh sách đơn phía sau một điểm biểu đồ',
    description: 'Có phân trang thật; ?limit chặn trần mỗi trang (mặc định 500).',
  })
  @ApiResponse({ status: 200, type: OrderPageDto })
  drill(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DrillFilterDto,
  ): Promise<PageResult<OrderListItemDto>> {
    return this.drillService.drill(user, f);
  }

  @Get('export')
  @Trang('dashboard', 'revenueReport')
  @ApiOperation({
    summary: 'Xuất Excel — doanh thu bị che theo quyền từng dòng',
    description: 'Trả file .xlsx; tên file nằm trong header Content-Disposition.',
  })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async exportExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Query() f: DrillFilterDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const buf = await this.drillService.exportExcel(user, f);
    const name = `beeops-don-hang-${new Date().toISOString().slice(0, 10)}.xlsx`;
    void res
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${name}"`)
      .send(buf);
  }
}
