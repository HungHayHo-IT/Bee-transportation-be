import { Module } from '@nestjs/common';
import { CustomerNotifyService } from './customer-notify.service';
import { NotificationCron } from './notification.cron';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationEvents } from './notification-events.service';
import { NotifyService } from './notify.service';
import { PushCron } from './push.cron';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotifyService,
    CustomerNotifyService,
    NotificationEvents,
    NotificationCron,
    PushCron,
  ],
  exports: [NotifyService, CustomerNotifyService],
})
export class NotificationsModule {}
