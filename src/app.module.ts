import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommonModule } from './common/common.module';
import { PermissionsApiModule } from './modules/permissions/permissions-api.module';
import { HealthController } from './health.controller';
import { ActivityModule } from './modules/activity/activity.module';
import { ReferenceModule } from './modules/reference/reference.module';
import { AuthModule } from './modules/auth/auth.module';
import { CollabModule } from './modules/collab/collab.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { MilestonesModule } from './modules/milestones/milestones.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TmsModule } from './modules/tms/tms.module';
import { SignaturesModule } from './modules/signatures/signatures.module';
import { CustomerAuthModule } from './modules/customer-auth/customer-auth.module';
import { CmsModule } from './modules/cms/cms.module';
import { NewsModule } from './modules/news/news.module';
import { QuoteRequestModule } from './modules/quote-requests/quote-request.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { SaleModule } from './modules/sale/sale.module';
import { ServicesModule } from './modules/services/services.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    CommonModule,
    ScheduleModule.forRoot(),
    // CỐ Ý không đăng ký ThrottlerGuard làm guard toàn cục: bóp mọi endpoint sẽ
    // chặn nhầm công việc thật của nhân viên (dashboard, hàng đợi, tải file).
    // Chỉ gắn @UseGuards(ThrottlerGuard) lên đúng vài endpoint công khai không
    // xác thực — xem CustomerAuthController.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    AuthModule,
    DepartmentsModule,
    UsersModule,
    ServicesModule,
    CustomersModule,
    PricingModule,
    SettingsModule,
    NotificationsModule,
    OrdersModule,
    TmsModule,
    SignaturesModule,
    QuotesModule,
    MilestonesModule,
    DashboardModule,
    CollabModule,
    ActivityModule,
    ReferenceModule,
    SaleModule,
    QuoteRequestModule,
    NewsModule,
    CmsModule,
    CustomerAuthModule,
    PermissionsApiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
