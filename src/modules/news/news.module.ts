import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsS3Service } from './news-s3.service';
import { NewsService } from './news.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, NewsS3Service],
})
export class NewsModule {}
