import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServicesModule } from '../services/services.module';
import { KhachXemDonController } from './khach-xem-don.controller';
import { KhachXemDonService } from './khach-xem-don.service';
import { OrdersController } from './orders.controller';
import { OrdersExportService } from './orders-export.service';
import { OrdersQueryService } from './orders-query.service';
import { OrdersService } from './orders.service';

@Module({
  imports: [NotificationsModule, CustomersModule, ServicesModule],
  controllers: [OrdersController, KhachXemDonController],
  providers: [OrdersService, OrdersQueryService, OrdersExportService, KhachXemDonService],
  // SignaturesModule cần cả hai: chốt PDF (export) và chốt đơn sau khi ký.
  exports: [OrdersService, OrdersQueryService, OrdersExportService],
})
export class OrdersModule {}
