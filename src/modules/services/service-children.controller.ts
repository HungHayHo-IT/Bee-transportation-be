import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { onePage, PageResult } from '@/common/dto/pagination.dto';
import { Trang } from '@/common/permissions/page.decorator';
import { TMS_MODES } from '@/common/reference/tms-modes';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateServiceChildDto, ServiceChildPageDto, ServiceChildResponseDto, UpdateServiceChildDto,
} from './dto/service-child.dto';
import { ServiceChildrenService } from './service-children.service';

@ApiTags('Service children (TMS)')
@Controller('services')
/* Giống hai controller anh em: ma trận phân quyền là nơi duy nhất quyết định
   ai vào được màn quản trị dịch vụ. Không gắn thêm @Roles. */
@Trang('services')
export class ServiceChildrenController {
  constructor(private readonly children: ServiceChildrenService) {}

  /**
   * Danh sách mã OF1 cho ô chọn. Khai báo TRƯỚC mọi route có `:id`, nếu không
   * NestJS khớp theo thứ tự và 'tms-modes' bị nuốt làm tham số id.
   *
   * Có endpoint thay vì để admin tự chép 18 chuỗi: danh sách này là một phần
   * HỢP ĐỒNG với OF1, và CHECK trong CSDL đọc cùng một nguồn. Chép sang
   * frontend là mời hai bên lệch nhau, mà lúc lệch thì người dùng chọn được
   * một mã rồi bị CSDL từ chối.
   */
  @Get('tms-modes')
  @Trang('createOrder', 'orders', 'orderDetail', 'services')
  @ApiOperation({ summary: '18 mã phương thức vận chuyển OF1-TMS cho ô chọn' })
  @ApiResponse({ status: 200, type: [String] })
  tmsModes(): { data: readonly string[] } {
    return { data: TMS_MODES };
  }

  /**
   * Bốn trang như `:id/form-schema`: form tạo đơn và trang chi tiết đơn đều
   * phải đọc danh sách này, mà ô "Dịch vụ & mốc tiến độ" mặc định là `none`
   * cho sale và trưởng phòng. Không đè thì lặp lại đúng lỗi cũ — ma trận bật
   * quyền tạo đơn mà giữa form vẫn báo không có quyền.
   */
  @Get(':id/children')
  @Trang('createOrder', 'orders', 'orderDetail', 'services')
  @ApiOperation({ summary: 'Dịch vụ con của một dịch vụ — mặc định KÈM dòng đã tắt' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: ServiceChildPageDto })
  async list(
    @Param('id', ParseIntPipe) id: number,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<PageResult<ServiceChildResponseDto>> {
    return onePage(await this.children.list(id, activeOnly === 'true'));
  }

  @Post(':id/children')
  @ApiOperation({ summary: 'Thêm dịch vụ con' })
  @ApiResponse({ status: 201, type: ServiceChildResponseDto })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateServiceChildDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceChildResponseDto> {
    return this.children.create(id, dto, user);
  }

  @Patch(':id/children/:childId')
  @ApiOperation({ summary: 'Sửa tên / mã TMS / thứ tự / trạng thái dịch vụ con' })
  @ApiResponse({ status: 200, type: ServiceChildResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('childId', ParseIntPipe) childId: number,
    @Body() dto: UpdateServiceChildDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceChildResponseDto> {
    return this.children.update(id, childId, dto, user);
  }

  @Delete(':id/children/:childId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xoá dịch vụ con — chỉ khi chưa đơn nào dùng' })
  @ApiResponse({ status: 204, description: 'Đã xoá' })
  @ApiResponse({ status: 409, description: 'Đã có đơn dùng — hãy tắt thay vì xoá' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('childId', ParseIntPipe) childId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.children.remove(id, childId, user);
  }
}
