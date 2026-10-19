import { Module } from '@nestjs/common';
import { AggregateReportGuard } from '@/common/guards/aggregate-report.guard';
import { DashboardController } from './dashboard.controller';
import { DrillService } from './drill.service';
import { OperationsService } from './operations.service';
import { RevenueService } from './revenue.service';

@Module({
  controllers: [DashboardController],
  providers: [RevenueService, OperationsService, DrillService, AggregateReportGuard],
})
export class DashboardModule {}
