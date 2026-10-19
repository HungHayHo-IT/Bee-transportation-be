import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { SettingsService, ThamSoDto } from './settings.service';

export class GhiThamSoDto {
  @ApiProperty({ example: 'pricing_lookup_per_hour' })
  @IsString()
  key!: string;

  @ApiProperty({ example: 60 })
  @Type(() => Number) @IsInt()
  value!: number;
}

@ApiTags('settings')
@Controller('settings')
@Trang('systemSettings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Tham số hệ thống sửa được' })
  @ApiResponse({ status: 200 })
  doc(): Promise<ThamSoDto[]> {
    return this.settings.doc();
  }

  @Put()
  @ApiOperation({ summary: 'Sửa một tham số — chỉ những khoá trong danh sách cho phép' })
  @ApiResponse({ status: 200 })
  ghi(@Body() dto: GhiThamSoDto, @CurrentUser() user: AuthenticatedUser): Promise<ThamSoDto[]> {
    return this.settings.ghi(dto.key, dto.value, user);
  }
}
