import {
  Body, Controller, Get, Param, ParseIntPipe, Post, Req, Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { KhachKyService } from './khach-ky.service';
import { SignaturesService } from './signatures.service';
import { KyDto, TrangThaiKyDto, TuChoiDto, XemKyDto } from './dto/signature.dto';

/**
 * Hai nhóm cửa, hai kiểu bảo vệ khác hẳn nhau.
 *
 * Nhóm `/orders/:id/signature*` là của NHÂN VIÊN — đi qua ma trận phân quyền
 * như mọi màn khác, trang `orderSignature`.
 *
 * Nhóm `/sign/:token` là của KHÁCH, không có tài khoản nhân viên nào. Chúng
 * khai `@Public` và tự bảo vệ bằng mã một lần 32 byte: mã chính là giấy thông
 * hành. Không có cửa nào khác ra được bản PDF đã chốt.
 */
@ApiTags('Ký điện tử')
@Controller()
export class SignaturesController {
  constructor(
    private readonly ky: SignaturesService,
    private readonly khach: KhachKyService,
  ) {}

  /* ------------------------------------------------------------ nhân viên */

  @Post('orders/:id/signature-request')
  @Trang('orderSignature')
  @ApiOperation({
    summary: 'Gửi khách ký phiếu xác nhận',
    description:
      'Chốt một bản PDF lên S3 kèm mã băm, sinh mã một lần và gửi email cho khách. '
      + 'Yêu cầu đang chờ trước đó (nếu có) bị huỷ — hai đường dẫn cùng sống thì '
      + 'ký cái nào cũng được và không ai biết bản nào thật.',
  })
  guiYeuCau(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ id: number }> {
    return this.ky.guiYeuCau(id, user);
  }

  @Get('orders/:id/signature')
  @Trang('orderDetail')
  @ApiOperation({ summary: 'Trạng thái ký mới nhất của đơn' })
  @ApiResponse({ status: 200, type: TrangThaiKyDto })
  trangThai(@Param('id', ParseIntPipe) id: number) {
    return this.ky.trangThaiCuaDon(id);
  }

  /* --------------------------------------------------------------- khách */

  @Public()
  @Get('sign/:token')
  @ApiOperation({ summary: 'Thông tin phiếu cần ký (công khai, cần mã)' })
  @ApiResponse({ status: 200, type: XemKyDto })
  xem(@Param('token') token: string): Promise<XemKyDto> {
    return this.khach.xem(token);
  }

  @Public()
  @Get('sign/:token/pdf')
  @ApiOperation({
    summary: 'Bản PDF đã chốt',
    description: 'Đã ký rồi thì trả bản đã ký. Mã chính là giấy thông hành.',
  })
  async pdf(
    @Param('token') token: string,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const { buffer, tenFile } = await this.khach.docPdf(token);
    await res
      .header('Content-Type', 'application/pdf')
      // inline: khách xem ngay trên trang, không phải tải về rồi mở
      .header('Content-Disposition', `inline; filename="${tenFile}"`)
      .send(buffer);
  }

  @Public()
  @Post('sign/:token/otp')
  @ApiOperation({ summary: 'Gửi mã xác thực tới email khách' })
  guiOtp(@Param('token') token: string): Promise<{ resendAfter: number }> {
    return this.khach.guiOtp(token);
  }

  @Public()
  @Post('sign/:token')
  @ApiOperation({
    summary: 'Khách ký',
    description: 'Kiểm mã OTP, chèn chữ ký vào bản đã chốt, rồi tự chốt đơn.',
  })
  kyPhieu(
    @Param('token') token: string,
    @Body() dto: KyDto,
    @Req() req: FastifyRequest,
  ): Promise<{ ok: true }> {
    return this.khach.ky(token, dto, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  @Public()
  @Post('sign/:token/reject')
  @ApiOperation({
    summary: 'Khách từ chối ký',
    description: 'Đơn GIỮ NGUYÊN trạng thái — sale còn thương lượng tiếp được.',
  })
  tuChoi(
    @Param('token') token: string,
    @Body() dto: TuChoiDto,
  ): Promise<{ ok: true }> {
    return this.khach.tuChoi(token, dto.lyDo);
  }
}
