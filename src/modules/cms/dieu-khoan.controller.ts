import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { DieuKhoanService } from './dieu-khoan.service';
import {
  DieuKhoanResponseDto, TaoDieuKhoanDto, SuaDieuKhoanDto, ToanVanDieuKhoanDto,
} from './dto/dieu-khoan.dto';

@ApiTags('CMS — điều khoản ký')
@Controller('cms/dieu-khoan')
/* Không gắn @Roles: ma trận phân quyền là nơi duy nhất quyết định ai vào được
   màn CMS. Trang 'cms' hiện là Admin toàn quyền, Giám đốc chỉ xem. */
@Trang('cms')
export class DieuKhoanController {
  constructor(private readonly dieuKhoan: DieuKhoanService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách điều khoản ký',
    description: 'KỂ CẢ điều đã tắt — màn quản trị cần thấy để bật lại.',
  })
  @ApiResponse({ status: 200, type: [DieuKhoanResponseDto] })
  danhSach(): Promise<DieuKhoanResponseDto[]> {
    return this.dieuKhoan.danhSach();
  }

  /** Xem trước ĐÚNG văn bản khách sẽ đọc, trước khi gửi đi. */
  @Get('toan-van')
  @ApiOperation({ summary: 'Toàn văn điều khoản — các điều đang bật ghép lại' })
  @ApiResponse({ status: 200, type: ToanVanDieuKhoanDto })
  async toanVan(): Promise<ToanVanDieuKhoanDto> {
    return { toanVan: await this.dieuKhoan.toanVan() };
  }

  @Post()
  @ApiOperation({ summary: 'Thêm một điều — xuống cuối danh sách' })
  @ApiResponse({ status: 201, type: DieuKhoanResponseDto })
  tao(
    @Body() dto: TaoDieuKhoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DieuKhoanResponseDto> {
    return this.dieuKhoan.tao(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa nội dung, thứ tự, hoặc bật/tắt một điều' })
  @ApiResponse({ status: 200, type: DieuKhoanResponseDto })
  sua(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SuaDieuKhoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DieuKhoanResponseDto> {
    return this.dieuKhoan.sua(id, dto, user);
  }

  /* Xoá hẳn được vì mỗi chữ ký đã chụp lại TOÀN VĂN điều khoản tại thời điểm
     ký — xoá hôm nay không làm sai chữ ký hôm qua. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá hẳn một điều' })
  xoa(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.dieuKhoan.xoa(id);
  }
}
