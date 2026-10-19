import { Module } from '@nestjs/common';
import { LandingRefreshModule } from '@/common/landing/landing-refresh.module';
import { NewsS3Service } from '../news/news-s3.service';
import { CmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { DieuKhoanController } from './dieu-khoan.controller';
import { DieuKhoanService } from './dieu-khoan.service';
import { PartnerLogosController } from './partner-logos.controller';
import { PartnerLogosService } from './partner-logos.service';

/**
 * Dùng lại NewsS3Service thay vì dựng một client S3 thứ hai: cùng bucket, cùng
 * cấu hình, chỉ khác tiền tố key. Hai client là hai chỗ phải nhớ cập nhật khi
 * đổi kho lưu trữ.
 */
@Module({
  imports: [LandingRefreshModule],
  controllers: [CmsController, DieuKhoanController, PartnerLogosController],
  providers: [CmsService, NewsS3Service, DieuKhoanService, PartnerLogosService],
  // ServicesModule gọi quenDanhMuc() sau khi thêm dịch vụ — xem CmsService.
  // SignaturesModule đọc DieuKhoanService để ghép toàn văn lúc gửi khách ký.
  exports: [CmsService, DieuKhoanService],
})
export class CmsModule {}
