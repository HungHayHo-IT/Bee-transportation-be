import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { QuoteRequestController } from './quote-request.controller';
import { QuoteRequestService } from './quote-request.service';

@Module({
  imports: [OrdersModule, NotificationsModule],
  controllers: [QuoteRequestController],
  providers: [QuoteRequestService],
})
export class QuoteRequestModule {}
