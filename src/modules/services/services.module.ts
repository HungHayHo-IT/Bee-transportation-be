import { Module } from '@nestjs/common';
import { CmsModule } from '../cms/cms.module';
import { LandingRefreshModule } from '@/common/landing/landing-refresh.module';
import { ServiceChildrenController } from './service-children.controller';
import { ServiceChildrenService } from './service-children.service';
import { ServiceDataValidator } from './service-data.validator';
import { ServiceFieldsController } from './service-fields.controller';
import { ServiceFieldsService } from './service-fields.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [LandingRefreshModule, CmsModule],
  controllers: [ServicesController, ServiceFieldsController, ServiceChildrenController],
  providers: [ServicesService, ServiceFieldsService, ServiceChildrenService, ServiceDataValidator],
  exports: [ServicesService, ServiceFieldsService, ServiceChildrenService, ServiceDataValidator],
})
export class ServicesModule {}
