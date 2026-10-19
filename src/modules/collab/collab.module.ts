import { Module } from '@nestjs/common';
import { StorageService } from '@/common/storage/storage.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CollabController } from './collab.controller';
import { CommentsService } from './comments.service';
import { FileCleanupCron } from './file-cleanup.cron';
import { FilesService } from './files.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CollabController],
  providers: [CommentsService, FilesService, StorageService, FileCleanupCron],
  exports: [StorageService],
})
export class CollabModule {}
