import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import {
  GuiMaDoiTacDto, GuiMaDoiTacKetQuaDto, KiemMaDoiTacDto, TaoTaiKhoanDoiTacDto,
  TaoTaiKhoanDoiTacKetQuaDto, VeDoiTacDto,
} from './dto/dang-ky-doi-tac.dto';
import { DangKyDoiTacService } from './dang-ky-doi-tac.service';

/**
 * Người của Bee Logistics tự mở tài khoản xem đơn trong admin.
 *
 * Cả ba bước đều @Public — người chưa có tài khoản thì không thể có token.
 * Thứ đứng thay cho đăng nhập là MÃ GỬI TỚI HỘP THƯ: chỉ người thật sự nhận
 * được thư ở `@beelogistics.com` mới đi hết được ba bước.
 */
@ApiTags('Auth — đối tác Bee Logistics')
@Controller('auth/doi-tac')
export class DangKyDoiTacController {
  constructor(private readonly dangKy: DangKyDoiTacService) {}

  @Post('gui-ma')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bước 1 — gửi mã 6 số tới hộp thư Bee Logistics',
    description: 'Email ngoài tên miền @beelogistics.com bị từ chối, không gửi mã.',
  })
  @ApiResponse({ status: 200, type: GuiMaDoiTacKetQuaDto })
  @ApiResponse({ status: 400, description: 'Email ngoài tên miền Bee Logistics' })
  @ApiResponse({ status: 409, description: 'Email này đã có tài khoản' })
  guiMa(@Body() dto: GuiMaDoiTacDto): Promise<GuiMaDoiTacKetQuaDto> {
    return this.dangKy.guiMa(dto.email);
  }

  @Post('kiem-ma')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bước 2 — nhập mã, nhận vé dùng cho bước cuối (10 phút)' })
  @ApiResponse({ status: 200, type: VeDoiTacDto })
  kiemMa(@Body() dto: KiemMaDoiTacDto): Promise<VeDoiTacDto> {
    return this.dangKy.kiemMa(dto.email, dto.code);
  }

  @Post('tao-tai-khoan')
  @Public()
  @ApiOperation({
    summary: 'Bước 3 — đổi vé lấy tài khoản, đặt mật khẩu',
    description: 'Email lấy TỪ VÉ chứ không từ body. Xong thì đăng nhập ở /auth/login như thường.',
  })
  @ApiResponse({ status: 201, type: TaoTaiKhoanDoiTacKetQuaDto })
  taoTaiKhoan(@Body() dto: TaoTaiKhoanDoiTacDto): Promise<TaoTaiKhoanDoiTacKetQuaDto> {
    return this.dangKy.taoTaiKhoan(dto.ticket, dto.fullName, dto.password);
  }
}
