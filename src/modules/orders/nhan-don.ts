import { ConflictException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { DON_CHUA_CO_SALE } from './don-chua-co-sale';
import { OrderDetailDto } from './dto/order-response.dto';
import { OrdersQueryService } from './orders-query.service';

interface Deps {
  prisma: PrismaService;
  activity: ActivityService;
  query: OrdersQueryService;
}

/**
 * Sale nhận một đơn chưa có ai đứng tên.
 *
 * Chỉ đổi `orders.created_by` — không cột mới, không migration. `created_by`
 * VỐN LÀ sale của đơn (chú thích cột đó trong db/schema.sql), cột "Sale" trên
 * danh sách đọc thẳng từ nó, và `ScopeService.orderWhere` cũng vậy. Nên một
 * phép gán này làm xong cả ba việc cùng lúc: cột hiện đúng tên, Sale khác thôi
 * nhìn thấy đơn, và bảng đánh giá nhân viên tính công cho đúng người.
 *
 * Điều kiện "còn nhận được" lấy CHUNG `DON_CHUA_CO_SALE` với orderWhere, chứ
 * không chép tay: lệch nhau là Sale thấy nút rồi bấm vào ăn 409, hoặc tệ hơn,
 * cướp được đơn của người khác.
 *
 * Cập nhật có ĐIỀU KIỆN trong cùng một câu lệnh (`updateMany` kèm vế lọc) chứ
 * không đọc rồi ghi: hai Sale bấm cùng lúc thì đọc-rồi-ghi cho qua cả hai và
 * người sau đè lên người trước. Ở đây người thứ hai nhận count = 0 và ăn 409.
 */
export async function nhanDon(
  deps: Deps,
  orderId: number,
  user: AuthenticatedUser,
): Promise<OrderDetailDto> {
  // Ngoài phạm vi đọc thì 404 ngay, trước khi chạm vào dữ liệu.
  const { code } = await deps.query.findScoped(orderId, user);
  const saleId = user.id;

  const { count } = await deps.prisma.order.updateMany({
    where: { AND: [{ id: orderId }, DON_CHUA_CO_SALE] },
    data: { createdBy: saleId, updatedAt: new Date() },
  });
  if (count === 0) throw new ConflictException('Đơn này đã có sale phụ trách');

  await deps.activity.log(null, {
    orderId,
    entity: 'orders',
    entityId: orderId,
    action: 'nhan_don',
    actorId: saleId,
    detail: { maDon: code },
  });

  return deps.query.detail(orderId, user);
}
