import { Module } from '@nestjs/common';
import { LandingRefreshModule } from '@/common/landing/landing-refresh.module';
import { NewsS3Service } from '../news/news-s3.service';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';

/**
 * Dùng lại NewsS3Service thay vì dựng client S3 thứ hai — cùng bucket, cùng
 * cấu hình, giống cách CmsModule đang làm.
 */
@Module({
  imports: [LandingRefreshModule],
  controllers: [SaleController],
  providers: [SaleService, NewsS3Service],
})
export class SaleModule {}
