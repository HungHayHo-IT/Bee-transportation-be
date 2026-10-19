import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { onePage, PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import { DepartmentsService } from './departments.service';
import {
  CreateDepartmentDto,
  DepartmentResponseDto,
  DepartmentTreeNodeDto,
  SetServicesDto,
  UpdateDepartmentDto,
  DepartmentPageDto,
  DepartmentTreePageDto,
} from './dto/department.dto';

@ApiTags('Departments (F7)')
@Controller('departments')
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  // Bộ lọc "phòng ban" của danh sách đơn (F5) mở cho mọi vai trò, nên danh mục
  // phòng ban phải đọc được không cần quyền Admin. Chỉ là tên phòng — thứ đã hiện
  // sẵn ở cột "Phòng phụ trách" của mọi đơn trong phạm vi người gọi. Sửa và xem chi
  // tiết vẫn giữ Admin.
  @Get()
  @ApiOperation({ summary: 'Danh sách phòng ban — danh mục dùng chung cho bộ lọc' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({ status: 200, type: DepartmentPageDto })
  async list(@Query('isActive') isActive?: string): Promise<PageResult<DepartmentResponseDto>> {
    return onePage(
      await this.departmentsService.list(isActive === undefined ? undefined : isActive === 'true'),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Tạo phòng ban' })
  @ApiResponse({ status: 201, type: DepartmentResponseDto })
  create(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DepartmentResponseDto> {
    return this.departmentsService.create(dto, user);
  }

  // PHẢI đứng trước @Get(':id'), nếu không ParseIntPipe nhận chuỗi 'tree'.
  // Mở cho mọi vai trò: sơ đồ tổ chức chính là thứ giúp người dùng biết nên
  // chuyển đơn cho phòng nào, và nó không chứa gì hơn tên với vai trò.
  @Get('tree')
  /* Cây phòng ban là dữ liệu của HAI màn: Phòng ban và Sơ đồ tổ chức. Chỉ cần
     một trong hai cho phép là qua — ép về một màn thì ô của màn kia bật lên mà
     màn vẫn trống. */
  @Trang('departments', 'orgChart')
  @ApiOperation({ summary: 'Sơ đồ tổ chức — cây phòng ban lồng nhau' })
  @ApiResponse({ status: 200, type: DepartmentTreePageDto })
  async tree(): Promise<PageResult<DepartmentTreeNodeDto>> {
    return onePage(await this.departmentsService.tree());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết phòng ban' })
  @ApiResponse({ status: 200, type: DepartmentResponseDto })
  detail(@Param('id', ParseIntPipe) id: number): Promise<DepartmentResponseDto> {
    return this.departmentsService.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa tên / trưởng phòng / trạng thái' })
  @ApiResponse({ status: 200, type: DepartmentResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DepartmentResponseDto> {
    return this.departmentsService.update(id, dto, user);
  }

  @Put(':id/services')
  @ApiOperation({ summary: 'Ghi đè ma trận định tuyến (F2)' })
  @ApiResponse({ status: 200, type: DepartmentResponseDto })
  setServices(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetServicesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DepartmentResponseDto> {
    return this.departmentsService.setServices(id, dto, user);
  }
}
