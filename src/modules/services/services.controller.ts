import {
  Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { onePage, PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateLandingServiceDto, CreateServiceDto, LandingServiceDto, LandingServicePageDto,
  ServiceResponseDto, SetMilestonesDto, UpdateServiceDto,
  ServicePageDto, PublicServicePageDto, PublicServiceResponseDto,
} from './dto/service.dto';
import { extractStaffToken, TokenCarrier } from '@/common/auth/staff-token.helper';
import { ServicesService } from './services.service';

@ApiTags('Services (F7)')
@Controller('services')
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Handler gắn @Public() nên guard toàn cục không điền req.user — muốn biết
   * người gọi là nhân viên hay khách vãng lai thì phải tự đọc và tự verify.
   * Token hỏng, hết hạn, là token KHÁCH (type='customer'), hay của người thuộc
   * công ty ĐỐI TÁC đều coi như chưa đăng nhập: thà trả thiếu cho người có
   * quyền còn hơn trả thừa cho người không có.
   */
  private async isStaff(req: TokenCarrier): Promise<boolean> {
    const raw = extractStaffToken(req);
    if (!raw) return false;
    try {
      const p = await this.jwt.verifyAsync<{ sub: number; type?: string }>(raw, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      if (!Number.isInteger(p?.sub) || p.type === 'customer') return false;
      /* Token hợp lệ chưa đủ: vai trò `partner` cũng dùng token của hệ nhân
         viên. Ma trận cho họ `none` ở trang Dịch vụ, nên đường này mà trả bản
         đầy đủ là API nói ngược lại ma trận. */
      return this.servicesService.laNhanVien(p.sub);
    } catch {
      return false;
    }
  }

  /**
   * Đường cho khách vãng lai, phải khai báo TRƯỚC mọi @Get(':id') sau này, nếu
   * không NestJS khớp theo thứ tự khai báo và 'public' bị nuốt làm tham số id.
   *
   * Tách endpoint riêng thay vì lọc bớt trường của ServiceResponseDto theo
   * trạng thái đăng nhập: DTO đầy đủ nằm nguyên sau guard, nên mai sau ai thêm
   * trường mới vào nó cũng không vô tình công khai trường đó.
   */
  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Danh mục dịch vụ đang bật — cho form báo giá của khách' })
  @ApiResponse({ status: 200, type: PublicServicePageDto })
  async listPublic(): Promise<PageResult<PublicServiceResponseDto>> {
    return onePage(await this.servicesService.listPublic());
  }

  /**
   * Danh sách dịch vụ tự thêm, cho landing dựng trang.
   *
   * @Public vì landing gọi lúc dựng trang, không có người đăng nhập. Chỉ trả
   * khoá, mã, tên và đường dẫn — không một trường nội bộ nào.
   *
   * Khai báo TRƯỚC mọi @Get(':id'), nếu không NestJS khớp theo thứ tự và
   * 'landing' bị nuốt làm tham số id.
   */
  @Public()
  @Get('landing')
  @ApiOperation({ summary: 'Dịch vụ tự thêm đang hiện trên landing (public)' })
  @ApiResponse({ status: 200, type: LandingServicePageDto })
  async listLanding(): Promise<PageResult<LandingServiceDto>> {
    return onePage(await this.servicesService.landingList());
  }

  /**
   * Thêm dịch vụ từ màn nội dung: vừa vào danh mục BeeOps, vừa lên landing.
   *
   * Quyền ADMIN, giống mọi thao tác khác ở màn nội dung — thêm một dịch vụ là
   * thêm một trang công khai và một lựa chọn trong form báo giá của khách.
   */
  @Post('landing')
  @ApiOperation({
    summary: 'Thêm dịch vụ hiện trên landing (Admin)',
    description: 'Tạo dòng trong danh mục dịch vụ, kèm khoá và đường dẫn cho trang giới thiệu.',
  })
  @ApiResponse({ status: 201, type: ServiceResponseDto })
  createForLanding(
    @Body() dto: CreateLandingServiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponseDto> {
    return this.servicesService.createForLanding(dto, user);
  }

  /**
   * CỬA SỔ CHUYỂN TIẾP — endpoint này vẫn mở công khai, nhưng nhìn người mà trả.
   *
   * Nó từng được gắn @Public() để khách chưa đăng nhập tải được danh mục, và
   * bản vá đó đã lên production. Nhưng ServiceResponseDto có 9 trường, nên mở
   * ra là công khai luôn departmentIds (sơ đồ phòng ban phụ trách từng dịch
   * vụ), slaHours và milestones — dữ liệu vận hành nội bộ.
   *
   * Khoá thẳng lại thì client nào đang gọi sẽ gãy ngay. Mà rò rỉ thật nằm ở
   * các TRƯỜNG thừa chứ không ở chuyện endpoint công khai — nên bịt trường là
   * đủ: người chưa đăng nhập nhận đúng bản rút gọn của /services/public.
   *
   * Khi app mobile đã chuyển hẳn sang /services/public thì bỏ @Public() ở đây
   * và xoá nhánh rẽ, trả handler này về đúng một dòng như cũ.
   */
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Danh mục 10 dịch vụ + bộ mốc + SLA',
    description:
      'Nhân viên đã đăng nhập nhận bản đầy đủ. Người chưa đăng nhập nhận bản '
      + 'rút gọn — hãy chuyển sang GET /services/public, đường công khai này '
      + 'sẽ bị khoá lại sau khi các client đã đổi.',
  })
  @ApiResponse({ status: 200, type: ServicePageDto })
  async list(
    @Req() req: TokenCarrier,
  ): Promise<PageResult<ServiceResponseDto | PublicServiceResponseDto>> {
    if (await this.isStaff(req)) return onePage(await this.servicesService.list());
    return onePage(await this.servicesService.listPublic());
  }

  @Get('unrouted')
  @ApiOperation({ summary: 'Dịch vụ chưa phòng nào phụ trách — cảnh báo cấu hình' })
  @ApiResponse({ status: 200, type: ServicePageDto })
  async unrouted(): Promise<PageResult<ServiceResponseDto>> {
    return onePage(await this.servicesService.unrouted());
  }

  @Post()
  @ApiOperation({ summary: 'Thêm dịch vụ' })
  @ApiResponse({ status: 201, type: ServiceResponseDto })
  create(
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponseDto> {
    return this.servicesService.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa tên / SLA / thứ tự / trạng thái (không đổi được mã)' })
  @ApiResponse({ status: 200, type: ServiceResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponseDto> {
    return this.servicesService.update(id, dto, user);
  }

  @Put(':id/milestones')
  @ApiOperation({ summary: 'Ghi đè bộ mốc tiến độ' })
  @ApiResponse({ status: 200, type: ServiceResponseDto })
  setMilestones(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetMilestonesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponseDto & { notice: string }> {
    return this.servicesService.setMilestones(id, dto, user);
  }
}
