import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { clamp, MAX_PAGE, PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto, CustomerDetailResponseDto, CustomerPageDto, CustomerResponseDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@ApiTags('Customers (F1)')
@Controller('customers')
@Trang('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Tìm khách hàng — gợi ý khi tạo đơn' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Mặc định 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 20, tối đa 100' })
  @ApiQuery({
    name: 'status',
    required: false,
    description:
      "Lọc theo trạng thái duyệt. Bỏ trống = CHỈ hồ sơ đã duyệt — đó là thứ ô " +
      'chọn khách lúc tạo đơn cần, và để mặc định trả cả hồ sơ chờ thì bước ' +
      'duyệt bị vô hiệu ngay tại chỗ gọi nhiều nhất.',
  })
  @ApiResponse({ status: 200, type: CustomerPageDto })
  search(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ): Promise<PageResult<CustomerResponseDto>> {
    return this.customersService.search(
      q,
      clamp(page, 1, 1, MAX_PAGE),
      clamp(limit, 20, 1, 100),
      status,
    );
  }

  /* KHÔNG gắn @Roles: ma trận phân quyền là nơi duy nhất quyết định ai tạo
     được. Gắn thêm ở đây là hai nguồn sự thật, và sửa ma trận xong vẫn bị
     chặn mà không ai hiểu vì sao. Bậc `edit` của ma trận cho POST đi qua, bậc
     `view` thì không. */
  @Post()
  @ApiOperation({
    summary: 'Tạo hồ sơ khách hàng',
    description: 'Tạo xong dùng được ngay — từ migration 052 không còn bước duyệt.',
  })
  @ApiResponse({ status: 201, type: CustomerResponseDto })
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerResponseDto> {
    return this.customersService.create(dto, user);
  }

  @Get(':id')
  @Trang('customerDetail')
  @ApiOperation({ summary: 'Chi tiết khách hàng (doanh thu theo phạm vi quyền)' })
  @ApiResponse({ status: 200, type: CustomerDetailResponseDto })
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerDetailResponseDto> {
    return this.customersService.detail(id, user);
  }

  @Patch(':id')
  @Trang('customerDetail')
  @ApiOperation({ summary: 'Sửa hồ sơ khách hàng' })
  @ApiResponse({ status: 200, type: CustomerResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerResponseDto> {
    return this.customersService.update(id, dto);
  }

  /**
   * Xoá hồ sơ khách hàng — chỉ bậc `full` của ma trận đi qua được (Admin,
   * Trưởng phòng). Sale ở bậc `edit` nên DELETE bị chặn ngay ở guard.
   *
   * Khách đang có đơn thì KHÔNG xoá: đơn trỏ vào khách bằng khoá ngoại, xoá
   * khách là đơn mất gốc. Trả 409 kèm số đơn để người dùng biết vì sao.
   */
  @Delete(':id')
  @Trang('customerDetail')
  @ApiOperation({ summary: 'Xoá hồ sơ khách hàng (Admin, Trưởng phòng)' })
  @ApiResponse({ status: 409, description: 'Khách đang có đơn hàng' })
  async xoa(@Param('id', ParseIntPipe) id: number): Promise<{ id: number }> {
    await this.customersService.xoa(id);
    return { id };
  }
}
