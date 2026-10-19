import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeProvince } from '@/common/reference/provinces';
import { CreateOrderDto, UpdateOrderDto } from './dto/order.dto';

/**
 * QA-02: tỉnh/thành là text tự do nên 'HN' và 'Hà Nội' cùng tồn tại, lát cắt doanh
 * thu theo tuyến bị tách đôi. Nhận mọi cách viết quen thuộc rồi quy về tên chuẩn;
 * gõ sai hẳn thì báo lỗi chứ không ghi bừa.
 */
function province(raw: string | undefined, field: string): string | null | undefined {
  const value = normalizeProvince(raw);
  if (value === null && raw !== undefined && raw.trim() !== '')
    throw new BadRequestException(
      `${field} "${raw}" không có trong danh mục tỉnh/thành. Xem GET /reference/provinces.`,
    );
  return value;
}

/**
 * Các cột đơn hàng mà client được phép ghi. `serviceData` KHÔNG có ở đây: nó phải đi
 * qua ServiceDataValidator để đối chiếu với bộ trường Admin cấu hình cho dịch vụ,
 * nên tầng gọi tự gắn kết quả đã kiểm tra vào.
 */
export function mapWritableOrder(
  dto: CreateOrderDto | UpdateOrderDto,
): Prisma.OrderUncheckedCreateInput {
  const d = dto as CreateOrderDto;
  return {
    customerId: d.customerId,
    serviceChildId: d.serviceChildId,
    originProvince: province(d.originProvince, 'Tỉnh/thành điểm đi'),
    originAddress: d.originAddress,
    destinationProvince: province(d.destinationProvince, 'Tỉnh/thành điểm đến'),
    destinationAddress: d.destinationAddress,
    // Địa điểm là THÊM vào chứ không thay tỉnh/thành: tỉnh/thành vẫn là thứ
    // báo cáo và bộ lọc đang chạy trên, và một địa chỉ giao tận nơi thì
    // tỉnh/thành mới là thông tin đúng.
    originLocationId: d.originLocationId,
    destinationLocationId: d.destinationLocationId,
    desiredDate: d.desiredDate ? new Date(d.desiredDate) : undefined,
    weightKg: d.weightKg,
    volumeCbm: d.volumeCbm,
    packageCount: d.packageCount,
    quantityUnit: d.quantityUnit,
    containerType: d.containerType,
    dimLM: d.dimLM,
    dimWM: d.dimWM,
    dimHM: d.dimHM,
    goodsName: d.goodsName,
    note: d.note,
    source: d.source,
  } as Prisma.OrderUncheckedCreateInput;
}
