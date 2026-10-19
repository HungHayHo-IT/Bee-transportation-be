import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { onePage, PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import {
  CreateServiceFieldDto, ServiceFieldPageDto, ServiceFieldResponseDto, ServiceFormSchemaDto,
  UpdateServiceFieldDto,
} from './dto/service-field.dto';
import { ServiceFieldsService } from './service-fields.service';

@ApiTags('Service fields (F1/F7)')
@Controller('services')
/* Không còn @Roles ở controller này: MA TRẬN PHÂN QUYỀN là nơi duy nhất quyết
   định ai vào được màn này. Giữ cả hai lớp thì lớp cứng luôn thắng — ô trong ma
   trận bật lên mà API vẫn 403, tức là màn quản trị nói dối người bấm. */
@Trang('services')
export class ServiceFieldsController {
  constructor(private readonly fields: ServiceFieldsService) {}

  /**
   * Bộ ô nhập riêng của một dịch vụ. KHÔNG phải cửa quản trị.
   *
   * Tự khai @Trang để ĐÈ lên @Trang('services') của cả lớp. Không đè thì nó thừa
   * hưởng ô "Dịch vụ & mốc tiến độ" bên Quản trị, mà ô đó mặc định là `none` cho
   * sale, trưởng phòng và nhân viên — tức là đúng những người cần nó nhất.
   *
   * Đã hỏng thật: Admin sale mở được trang Tạo đơn hàng (ô `createOrder` là Toàn
   * quyền), chọn dịch vụ xong thì giữa form hiện "Vai trò của bạn không có quyền
   * vào trang này" và không có bộ trường nào để điền. Ma trận hứa một đằng, API
   * làm một nẻo.
   *
   * Bốn trang vì bên admin có bốn lối gọi tới đây: form tạo đơn, hộp sửa đơn và
   * trang chi tiết đơn, bộ lọc theo trường riêng ở danh sách đơn, và màn quản trị
   * dịch vụ. Có MỘT trong số đó là đủ — xem PageAccessGuard.
   */
  @Get(':id/form-schema')
  @Trang('createOrder', 'orders', 'orderDetail', 'services')
  @ApiOperation({
    summary: 'Ô hàng hóa được dùng + bộ ô riêng + hai đầu tuyến',
    description:
      'Truyền `serviceChildId` khi đơn đã chọn dịch vụ con: hai cờ điểm đi/đến và '
      + 'bộ ô riêng đổi theo nó. Hàng xuất và hàng nhập nằm cùng một dịch vụ cha '
      + 'nhưng ngược đầu nhau.',
  })
  @ApiQuery({ name: 'serviceChildId', required: false, type: Number })
  @ApiResponse({ status: 200, type: ServiceFormSchemaDto })
  schema(
    @Param('id', ParseIntPipe) id: number,
    @Query('serviceChildId') serviceChildId?: string,
  ): Promise<ServiceFormSchemaDto> {
    const con = Number(serviceChildId);
    return this.fields.schema(id, Number.isFinite(con) && con > 0 ? con : undefined);
  }

  /**
   * QA-30: mặc định trả CẢ trường đã ngừng dùng. Đây là tuyến quản trị — giấu chúng
   * đi là giấu luôn id, mà không có id thì không gọi được PATCH để bật lại. Muốn chỉ
   * xem trường đang dùng thì có sẵn GET :id/form-schema, hoặc ?activeOnly=true.
   */
  @Get(':id/fields')
  @ApiOperation({
    summary: 'Danh sách trường riêng — Admin, mặc định KÈM trường đã ngừng dùng',
  })
  @ApiQuery({
    name: 'activeOnly',
    required: false,
    type: Boolean,
    description: 'true = bỏ qua trường đã ngừng dùng. Mặc định false.',
  })
  @ApiResponse({ status: 200, type: ServiceFieldPageDto })
  async list(
    @Param('id', ParseIntPipe) id: number,
    @Query('activeOnly') activeOnly?: string,
  ): Promise<PageResult<ServiceFieldResponseDto>> {
    return onePage(await this.fields.list(id, activeOnly !== 'true'));
  }

  @Post(':id/fields')
  @ApiOperation({ summary: 'Thêm một ô nhập cho dịch vụ' })
  @ApiResponse({ status: 201, type: ServiceFieldResponseDto })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateServiceFieldDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceFieldResponseDto> {
    return this.fields.create(id, dto, user);
  }

  // Trường có id toàn cục nên không cần lồng dưới :id dịch vụ nữa — lồng thêm chỉ
  // mở ra khả năng hai tham số chỏi nhau.
  @Patch('fields/:fieldId')
  @ApiOperation({ summary: 'Sửa nhãn / kiểu / lựa chọn / thứ tự / bật tắt' })
  @ApiResponse({ status: 200, type: ServiceFieldResponseDto })
  update(
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @Body() dto: UpdateServiceFieldDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceFieldResponseDto> {
    return this.fields.update(fieldId, dto, user);
  }

  @Delete('fields/:fieldId')
  @ApiOperation({
    summary: 'Xóa trường',
    description:
      'Đã có đơn nhập giá trị thì chỉ NGỪNG DÙNG chứ không xóa — đọc `deleted` trong ' +
      'phản hồi để biết chuyện gì đã xảy ra.',
  })
  remove(
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ deleted: boolean; notice: string }> {
    return this.fields.remove(fieldId, user);
  }
}
