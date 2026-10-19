import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { LocationsController } from './locations.controller';
import { PriceSessionsController } from './price-sessions.controller';
import { PricingController } from './pricing.controller';
import { RegionRoutesController } from './region-routes.controller';
import { GioiHanTraGia } from './gioi-han-tra-gia';
import { PricingIoService } from './pricing-io.service';
import { PricingXuatService } from './pricing-xuat.service';
import { LocationsIoService } from './locations-io.service';
import { LocationsService } from './locations.service';
import { PriceSessionsService } from './price-sessions.service';
import { PricingService } from './pricing.service';
import { RegionRouteIoService } from './region-route-io.service';
import { RegionRoutesService } from './region-routes.service';

@Module({
  // Chi can OrdersQueryService de kiem pham vi don truoc khi tra gia niem yet.
  imports: [OrdersModule],
  controllers: [
    PricingController, LocationsController, PriceSessionsController, RegionRoutesController,
  ],
  providers: [
    PricingService, LocationsService, PriceSessionsService, RegionRoutesService,
    RegionRouteIoService,
    PricingIoService, PricingXuatService, GioiHanTraGia, LocationsIoService,
  ],
  exports: [PricingService, LocationsService, PriceSessionsService, RegionRoutesService],
})
export class PricingModule {}
