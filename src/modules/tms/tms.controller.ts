import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { Role } from '@/common/enums';
import { Trang } from '@/common/permissions/page.decorator';
import { TmsService } from './tms.service';
import type { KetQuaDayTms } from './of1.client';
import type { OThieu } from './tms-payload.helper';

@ApiTags('OF1-TMS')
@Controller('orders')
/* Thuộc trang "Chi tiết đơn": đẩy sang TMS là một việc làm trên một đơn cụ
   thể. Vai trò đối tác chỉ có mức XEM ở trang này nên POST bị chặn sẵn, không
   phải viết thêm luật — xem ma trận phân quyền. */
@Trang('orderDetail')
export class TmsController {
  constructor(private readonly tms: TmsService) {}

  @Post(':id/tms')
  /* Chỉ Admin và Admin sale. Trưởng phòng KHÔNG: đẩy đơn sang OF1 là tạo một
     bill thật bên đối tác, và OF1 không chặn trùng — đó là việc của người chốt
     đơn chứ không phải của người điều hành một phòng.

     Danh sách này PHẢI trùng ACTION_ROLES[PushToTms] bên admin. Lệch là nút
     hiện ra rồi bấm vào ăn 403, hoặc tệ hơn: ẩn nút của người thật sự có quyền. */
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({
    summary: 'Đẩy đơn sang OF1-TMS',
    description:
      'Mỗi đơn chỉ vào OF1 một lần. Đơn OF1 đã TỪ CHỐI thì sửa dữ liệu rồi đẩy lại được; '
      + 'đơn ở trạng thái "khong_ro" thì KHÔNG — phải đối soát với OF1 theo mã đơn trước, '
      + 'vì OF1 không chặn trùng và đơn có thể đã vào rồi.',
  })
  @ApiResponse({ status: 409, description: 'Đơn đã đẩy, hoặc đang được đẩy ở nơi khác' })
  @ApiResponse({
    status: 422,
    description: 'Đơn thiếu ô bắt buộc — thân phản hồi có mảng `thieu` liệt kê từng ô',
  })
  @ApiResponse({ status: 503, description: 'Máy chủ chưa cấu hình OF1-TMS' })
  day(@Param('id', ParseIntPipe) id: number): Promise<KetQuaDayTms> {
    return this.tms.day(id);
  }

  /* Chỉ ĐỌC nên không gắn @Roles: ai xem được đơn thì xem được đơn ấy còn
     thiếu gì. Nút đẩy vẫn do @Roles ở trên canh. */
  @Get(':id/tms/kiem')
  @ApiOperation({
    summary: 'Đơn còn thiếu ô bắt buộc nào để đẩy sang OF1-TMS',
    description: 'Không gửi gì sang OF1. Mảng rỗng = đẩy được.',
  })
  kiem(@Param('id', ParseIntPipe) id: number): Promise<{ thieu: OThieu[] }> {
    return this.tms.kiem(id);
  }
}
