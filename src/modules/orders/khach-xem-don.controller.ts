import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentCustomer } from '@/common/decorators/current-customer.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { PageResult } from '@/common/dto/pagination.dto';
import { CustomerJwtGuard } from '@/common/guards/customer-jwt.guard';
import { AuthenticatedCustomer } from '@/common/types/authenticated-customer.type';
import { DonCuaCongTyDto, DonCuaCongTyPageDto } from './dto/khach-xem-don.dto';
import { KhachXemDonService } from './khach-xem-don.service';

const TRANG_TOI_DA = 1000;

/** Giữ page/limit trong khoảng hợp lệ mà không ném lỗi — client gửi rác thì về mặc định. */
function trongKhoang(raw: string | undefined, mac: number, nho: number, lon: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return mac;
  return Math.min(Math.max(Math.trunc(n), nho), lon);
}

/**
 * Cửa riêng cho KHÁCH đang đăng nhập, tách khỏi OrdersController.
 *
 * Tách vì OrdersController gắn @Trang ở cấp lớp — đó là ma trận phân quyền của
 * NHÂN VIÊN. Nhét một route của khách vào đó là trộn hai hệ đăng nhập trong
 * một file, và chỉ cần một lần quên @Public là khách bị guard nhân viên chặn,
 * hoặc tệ hơn, một route nhân viên lọt ra ngoài vì thừa @Public.
 *
 * @Public() + @UseGuards(CustomerJwtGuard) là cặp bắt buộc: @Public tắt guard
 * nhân viên toàn cục, CustomerJwtGuard bật guard khách vào thay. Thiếu vế sau
 * là endpoint này mở toang.
 */
@ApiTags('Đơn hàng — khách Bee Logistics')
@Controller('orders')
export class KhachXemDonController {
  constructor(private readonly khachXemDon: KhachXemDonService) {}

  @Get('cong-ty-cua-toi')
  @Public()
  @UseGuards(CustomerJwtGuard)
  @ApiOperation({
    summary: 'Đơn của công ty tôi (khách Bee Logistics đang đăng nhập)',
    description:
      'Người đăng nhập bằng email @beelogistics.com thấy mọi đơn mà hồ sơ khách '
      + 'cũng mang email tên miền đó. Tài khoản ngoài tên miền nhận 403.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, type: DonCuaCongTyPageDto })
  @ApiResponse({ status: 403, description: 'Tài khoản không thuộc Bee Logistics' })
  danhSach(
    @CurrentCustomer() khach: AuthenticatedCustomer,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PageResult<DonCuaCongTyDto>> {
    return this.khachXemDon.danhSach(
      khach,
      trongKhoang(page, 1, 1, TRANG_TOI_DA),
      trongKhoang(limit, 20, 1, 100),
    );
  }
}
