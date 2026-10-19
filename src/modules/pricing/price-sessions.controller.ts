import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import { laDoiTac } from '@/common/scope/la-doi-tac';
import { PriceSessionsService } from './price-sessions.service';
import {
  CreatePriceSessionDto, PriceSessionPageDto, PriceSessionResponseDto, UpdatePriceSessionDto,
} from './dto/pricing.dto';

/**
 * Phiên bảng giá: soạn → công bố → lưu trữ.
 *
 * Cùng ô `priceList` với bảng giá — xem được bảng giá thì xem được phiên, vì
 * một con giá không có phiên đi kèm thì không biết nó đang áp dụng hay đã cũ.
 */
@ApiTags('Bảng giá tuyến')
@Controller()
@Trang('priceList')
export class PriceSessionsController {
  constructor(private readonly phien: PriceSessionsService) {}

  @Get('price-sessions')
  @ApiOperation({ summary: 'Danh sách phiên giá — phiên đang áp dụng lên đầu' })
  @ApiResponse({ status: 200, type: PriceSessionPageDto })
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PageResult<PriceSessionResponseDto>> {
    // Đối tác chỉ thấy phiên đang áp dụng: phiên nháp là giá kỳ sau chưa công bố.
    return this.phien.listSessions(laDoiTac(user));
  }

  @Get('price-sessions/active')
  @ApiOperation({ summary: 'Phiên đang áp dụng — null nếu chưa công bố phiên nào' })
  activeSession(): Promise<PriceSessionResponseDto | null> {
    return this.phien.activeSession();
  }

  @Post('price-sessions')
  @ApiOperation({ summary: 'Tạo phiên giá — chép được dòng giá từ phiên cũ' })
  @ApiResponse({ status: 201, type: PriceSessionResponseDto })
  createSession(
    @Body() dto: CreatePriceSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PriceSessionResponseDto> {
    return this.phien.createSession(dto, user);
  }

  @Patch('price-sessions/:id')
  @ApiOperation({ summary: 'Sửa tên / ngày hiệu lực / ghi chú' })
  @ApiResponse({ status: 200, type: PriceSessionResponseDto })
  updateSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePriceSessionDto,
  ): Promise<PriceSessionResponseDto> {
    return this.phien.updateSession(id, dto);
  }

  @Post('price-sessions/:id/activate')
  @ApiOperation({ summary: 'Công bố phiên — phiên đang áp dụng tự chuyển sang lưu trữ' })
  @ApiResponse({ status: 200, type: PriceSessionResponseDto })
  activate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PriceSessionResponseDto> {
    return this.phien.activateSession(id, user);
  }

  @Delete('price-sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá phiên — chỉ phiên đang soạn' })
  deleteSession(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.phien.deleteSession(id);
  }
}
