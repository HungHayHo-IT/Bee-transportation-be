import { Module } from '@nestjs/common';
import { LandingRefreshService } from './landing-refresh.service';

/** Dùng chung cho CMS và màn người đại diện — cả hai đều làm đổi trang landing. */
@Module({ providers: [LandingRefreshService], exports: [LandingRefreshService] })
export class LandingRefreshModule {}
