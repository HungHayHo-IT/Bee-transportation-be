import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { clamp, MAX_PAGE, PageResult } from '@/common/dto/pagination.dto';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import {
  CreateUserDto, SetStatusDto, TempPasswordResponseDto, UpdateUserDto, UserPageDto,
  UserResponseDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users (F7)')
@Controller('users')
@Roles(Role.ADMIN)
@Trang('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // QA-01: trưởng phòng phải liệt kê được người của phòng mình thì mới giao việc
  // được. Nới quyền ở tuyến, còn phạm vi dòng do service ép theo phòng của người gọi.
  @Get()
  @Roles(Role.ADMIN, Role.LEADER, Role.MANAGER)
  @ApiOperation({
    summary: 'Danh sách nhân viên',
    description:
      'Admin/ban lãnh đạo xem toàn công ty. Trưởng phòng chỉ xem được phòng mình — ' +
      'truyền departmentId của phòng khác sẽ trả về mảng rỗng.',
  })
  @ApiQuery({ name: 'departmentId', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 50, tối đa 200' })
  @ApiResponse({ status: 200, type: UserPageDto })
  list(
    @Query('departmentId') departmentId?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<PageResult<UserResponseDto>> {
    return this.usersService.list(
      {
        departmentId: departmentId ? Number(departmentId) : undefined,
        role,
        isActive: isActive === undefined ? undefined : isActive === 'true',
        q,
      },
      user as AuthenticatedUser,
      clamp(page, 1, 1, MAX_PAGE),
      clamp(limit, 50, 1, 200),
    );
  }

  // Trưởng phòng tự lập tài khoản cho người của phòng mình, khỏi phải nhờ Admin
  // từng lần. Nới ở tuyến, còn phạm vi do create-scope.helper ép: chỉ vai trò
  // Nhân viên/Sale và chỉ đúng phòng của người gọi.
  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({
    summary: 'Tạo tài khoản — trả mật khẩu tạm một lần',
    description:
      'Admin tạo được mọi vai trò ở mọi phòng. Trưởng phòng chỉ tạo được vai trò ' +
      'Nhân viên hoặc Sale, và luôn thuộc phòng của chính họ.',
  })
  @ApiResponse({ status: 201, type: UserResponseDto })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto & { tempPassword: string }> {
    return this.usersService.create(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết nhân viên' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  detail(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa thông tin, phòng ban, vai trò, cờ báo cáo' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Khóa / mở tài khoản — có hiệu lực ngay' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    return this.usersService.setStatus(id, dto, user);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Cấp mật khẩu tạm mới' })
  @ApiResponse({ status: 201, type: TempPasswordResponseDto })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TempPasswordResponseDto> {
    return this.usersService.resetPassword(id, user);
  }

  /**
   * Xoá THẬT một tài khoản nhân viên. Chỉ Admin — thừa hưởng @Roles ở lớp
   * controller.
   *
   * Ba vai điều hành (Admin, Giám đốc, Trưởng phòng) KHÔNG xoá được: xoá nhầm
   * là mất đường vào hệ thống hoặc mất người duyệt của cả một phòng. Hạ vai
   * trước rồi mới xoá.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xoá tài khoản nhân viên — xoá thật, không hoàn tác được',
    description:
      'Nhật ký và bình luận của người đó bị xoá theo; người phụ trách, người tick mốc '
      + 'và người sửa cấu hình bị bỏ trống. ĐƠN HÀNG và PHIẾU KÝ thì CHUYỂN sang người '
      + 'khác chứ không xoá — phiếu ký là chứng cứ của hợp đồng khách đã ký. Tài khoản '
      + 'đang đứng tên đơn thì phải truyền `chuyenDonCho`.',
  })
  @ApiQuery({
    name: 'chuyenDonCho',
    required: false,
    type: Number,
    description: 'Id người nhận lại đơn và phiếu ký. Bắt buộc khi tài khoản đang đứng tên chúng.',
  })
  @ApiResponse({ status: 204, description: 'Đã xoá' })
  @ApiResponse({
    status: 409,
    description: 'Vai bị chặn, tự xoá mình, hoặc đang đứng tên đơn mà chưa chọn người nhận',
  })
  async xoa(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
    @Query('chuyenDonCho') chuyenDonCho?: string,
  ): Promise<void> {
    const nhan = chuyenDonCho === undefined || chuyenDonCho === ''
      ? undefined
      : Number(chuyenDonCho);
    await this.usersService.xoa(id, Number.isFinite(nhan) ? nhan : undefined, actor);
  }
}
