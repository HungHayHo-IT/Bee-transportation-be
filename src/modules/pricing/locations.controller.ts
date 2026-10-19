import {
  BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PageResult } from '@/common/dto/pagination.dto';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { Trang } from '@/common/permissions/page.decorator';
import { LocationsIoService } from './locations-io.service';
import { LocationsService } from './locations.service';
import {
  CreateLocationDto, ImportResultDto, LocationPageDto, LocationResponseDto, UpdateLocationDto,
} from './dto/pricing.dto';

/**
 * Danh mục địa điểm — hai đầu của mọi tuyến giá.
 *
 * Ô riêng trong ma trận (`priceLocations`), không phải `priceList`: sửa danh mục
 * địa điểm là đổi thứ mà MỌI tuyến giá tham chiếu tới, nên nó đáng được bật tắt
 * tách khỏi quyền xem bảng giá.
 */
@ApiTags('Bảng giá tuyến')
@Controller()
export class LocationsController {
  constructor(
    private readonly diaDiem: LocationsService,
    private readonly io: LocationsIoService,
  ) {}

  /* ĐỌC danh mục đi theo QUYỀN ĐƠN HÀNG, không theo quyền của màn bảng giá.
     Khai nhiều trang thì chỉ cần MỘT trang cho phép là qua.

     Danh mục địa điểm không lộ giá — nó chỉ nói có những kho, cảng nào. Nhưng
     Sale phải CHỌN được địa chỉ lúc nhập đơn, mà chọn thì phải đọc được danh
     sách. Buộc nó vào một khoá của màn bảng giá nghĩa là: ai đó khoá màn bảng
     giá lại — đúng việc họ được phép làm, và họ chỉ định khoá VIỆC XEM GIÁ —
     thì ô chọn kho trong form đơn im lặng trả về rỗng. Đã xảy ra thật: hạ
     `priceLookup` xuống `none` lúc 18:41 là Sale chọn Hải Phòng ra "không có
     địa chỉ nào khớp", trong khi Cảng Đình Vũ vẫn nằm đó.

     `priceLookup` giữ lại trong danh sách vì nó là khoá của việc TRA GIÁ một
     tuyến — thứ thật sự nói về giá, và vẫn khoá được riêng. */
  @Get('locations')
  @Trang('priceLookup', 'createOrder', 'orders')
  @ApiOperation({ summary: 'Danh mục địa điểm đầu tuyến' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({
    name: 'province',
    required: false,
    description: 'Lọc theo tỉnh/thành. Nhận cả tên cũ trước sáp nhập 2025.',
  })
  @ApiQuery({
    name: 'regionId',
    required: false,
    type: Number,
    description: 'Lọc theo khu vực bảng giá (061) — danh mục địa điểm trong màn Khu vực và tuyến.',
  })
  @ApiResponse({ status: 200, type: LocationPageDto })
  listLocations(
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('province') province?: string,
    @Query('regionId') regionId?: string,
  ): Promise<PageResult<LocationResponseDto>> {
    const khuVuc = Number(regionId);
    return this.diaDiem.listLocations(
      q,
      includeInactive === 'true',
      province,
      Number.isFinite(khuVuc) && khuVuc > 0 ? khuVuc : undefined,
    );
  }

  @Post('locations')
  @Trang('priceLocations')
  @ApiOperation({ summary: 'Thêm địa điểm' })
  @ApiResponse({ status: 201, type: LocationResponseDto })
  createLocation(
    @Body() dto: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LocationResponseDto> {
    return this.diaDiem.createLocation(dto, user);
  }

  @Post('locations/import')
  @Trang('priceLocations')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Nhập danh mục địa điểm từ Excel',
    description:
      'Chỉ cột "Tên" là bắt buộc. Tên ĐÃ CÓ thì bỏ qua, KHÔNG ghi đè — file nhập thường ' +
      'là cả danh mục, ghi đè sẽ xoá mất địa chỉ và mã OF1 người ta bổ sung bằng tay. ' +
      'Tỉnh không nhận ra thì để trống chứ không bỏ cả dòng.',
  })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'Tên trường phải là "file"' } },
    },
  })
  @ApiResponse({ status: 201, type: ImportResultDto })
  async importLocations(
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportResultDto> {
    const mp = req as unknown as { isMultipart(): boolean; file(): Promise<{ toBuffer(): Promise<Buffer> } | undefined> };
    if (!mp.isMultipart()) throw new BadRequestException('Phải gửi dạng multipart/form-data');
    const part = await mp.file();
    if (!part) throw new BadRequestException('Không có file nào được gửi lên');
    return this.io.importLocations(await part.toBuffer(), user);
  }

  @Patch('locations/:id')
  @Trang('priceLocations')
  @ApiOperation({ summary: 'Sửa địa điểm — tắt bằng isActive, không xoá' })
  @ApiResponse({ status: 200, type: LocationResponseDto })
  updateLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationDto,
  ): Promise<LocationResponseDto> {
    return this.diaDiem.updateLocation(id, dto);
  }
}
