import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QueueService } from './queue.service';
import { QuoteHistoryService } from './quote-history.service';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { SelectionService } from './selection.service';

@Module({
  imports: [NotificationsModule],
  controllers: [QuotesController],
  providers: [QuotesService, SelectionService, QueueService, QuoteHistoryService],
})
export class QuotesModule {}
