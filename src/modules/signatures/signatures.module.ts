import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { OrdersModule } from '../orders/orders.module';
import { ChuKyS3Service } from './chu-ky-s3.service';
import { KhachKyService } from './khach-ky.service';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';

/**
 * Ký điện tử dựng trên những mảnh đã có: phiếu xác nhận PDF của OrdersModule,
 * cơ chế OTP của CustomerAuthModule. Không mảnh nào bị chép lại ở đây.
 */
@Module({
  // CmsModule: điều khoản ký soạn trong CMS — xem DieuKhoanService.
  imports: [OrdersModule, CustomerAuthModule, CmsModule],
  controllers: [SignaturesController],
  providers: [SignaturesService, KhachKyService, ChuKyS3Service],
})
export class SignaturesModule {}
