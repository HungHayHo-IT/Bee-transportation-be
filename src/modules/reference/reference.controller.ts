import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { onePage, PagedDto, PageResult } from '@/common/dto/pagination.dto';
import { Public } from '@/common/decorators/public.decorator';
import { OrderSource, OrderStatus, REJECT_REASONS } from '@/common/enums';
import { PROVINCES } from '@/common/reference/provinces';
import { QUANTITY_UNITS } from '@/common/reference/quantity-units';
import { statusLabel } from '../orders/order-state.helper';

export class LabeledDto {
  value!: string;
  label!: string;
}

export class StringPageDto extends PagedDto(String) {}
export class LabeledPageDto extends PagedDto(LabeledDto) {}

/**
 * Danh mục để front-end đổ vào ô chọn. Trước đây các giá trị này chỉ nằm rải rác
 * trong tài liệu, mỗi màn hình gõ tay một bản — nguồn gốc của QA-02 (tỉnh/thành lẫn
 * 'HN' với 'Hà Nội').
 */
@ApiTags('Reference')
@Controller('reference')
export class ReferenceController {
  // Cùng lý do với danh mục dịch vụ: form báo giá của khách chưa đăng nhập cần
  // ô chọn tỉnh/thành; danh sách này là dữ liệu hành chính công khai.
  @Public()
  @Get('provinces')
  @ApiOperation({ summary: 'Danh mục tỉnh/thành hợp lệ cho điểm đi / điểm đến' })
  @ApiResponse({ status: 200, type: StringPageDto })
  provinces(): PageResult<string> {
    return onePage([...PROVINCES]);
  }

  @Get('order-statuses')
  @ApiOperation({ summary: 'Trạng thái đơn kèm nhãn tiếng Việt' })
  @ApiResponse({ status: 200, type: LabeledPageDto })
  orderStatuses(): PageResult<LabeledDto> {
    return onePage(Object.values(OrderStatus).map((value) => ({ value, label: statusLabel(value) })));
  }

  @Get('reject-reasons')
  @ApiOperation({ summary: 'Nhóm lý do khách từ chối' })
  @ApiResponse({ status: 200, type: StringPageDto })
  rejectReasons(): PageResult<string> {
    return onePage([...REJECT_REASONS]);
  }

  /**
   * Đơn vị tính của số lượng khi đẩy đơn sang OF1-TMS.
   *
   * Trả `value`/`label` như mọi danh mục khác để ô chọn dùng chung một hình
   * dạng — nhãn là thứ người nhập đọc ('Package(s)'), mã là thứ OF1 nhận.
   */
  @Get('quantity-units')
  @ApiOperation({ summary: 'Đơn vị tính của số kiện (danh mục OF1-TMS)' })
  @ApiResponse({ status: 200, type: LabeledPageDto })
  quantityUnits(): PageResult<LabeledDto> {
    return onePage(QUANTITY_UNITS.map((u) => ({ value: u.code, label: u.label })));
  }

  @Get('order-sources')
  @ApiOperation({ summary: 'Nguồn đơn' })
  @ApiResponse({ status: 200, type: StringPageDto })
  orderSources(): PageResult<string> {
    return onePage(Object.values(OrderSource));
  }
}
