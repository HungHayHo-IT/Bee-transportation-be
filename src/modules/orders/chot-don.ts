import { BadRequestException, ConflictException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotifType, NotifType, OrderStatus } from '@/common/enums';
import { NotifyService } from '@/modules/notifications/notify.service';
import { CustomerNotifyService } from '@/modules/notifications/customer-notify.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CloseOrderDto } from './dto/order.dto';
import { assertTransition } from './order-state.helper';
import { giaChoKhach, laDonLanding } from './gia-sale.helper';

/**
 * Các dịch vụ `chotDon` cần. Nhận vào chứ không tiêm, vì đây là HÀM chứ không
 * phải phương thức — xem chú thích của hàm bên dưới.
 */
export interface PhuThuocChotDon {
  prisma: PrismaService;
  activity: ActivityService;
  notify: NotifyService;
  customerNotify: CustomerNotifyService;
}

/**
 * Chốt đơn, KHÔNG kiểm phạm vi dữ liệu của người gọi.
 *
 * Tách ra vì có hai đường dẫn tới cùng một việc: sale bấm nút, và khách ký
 * xác nhận điện tử. Đường thứ hai không có người đăng nhập nào để kiểm phạm
 * vi — nhưng nó cũng không cần, vì cái cho qua là chữ ký của chính khách.
 *
 * Chép đôi phần thân này sang luồng ký thì sớm muộn hai bên lệch nhau: một
 * bên ghi doanh thu, bên kia quên sinh bộ mốc, và không ai phát hiện cho tới
 * lúc báo cáo lệch.
 */
export async function chotDon(
phuThuoc: PhuThuocChotDon,
id: number,
note: string | null,
actorId: number,
maDon: string,
deptId: number | null,
): Promise<void> {
  const { prisma, activity, notify, customerNotify } = phuThuoc;
  const dto = { note: note ?? undefined } as CloseOrderDto;
  const user = { id: actorId } as AuthenticatedUser;
  const current = { code: maDon, departmentId: deptId };

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id } });
    assertTransition(order.status, OrderStatus.CLOSED);

    // Phòng phụ trách đã chốt ở bước select-quote. KHÔNG nhận lại từ body.
    if (!order.departmentId) throw new ConflictException('Đơn chưa chọn báo giá thắng');

    const won = await tx.orderDepartment.findUniqueOrThrow({
      where: { orderId_departmentId: { orderId: id, departmentId: order.departmentId } },
    });
    // Đơn landing chốt theo giá Sale thoả thuận với khách, không theo giá phòng ban.
    const gia = giaChoKhach(order, won.amount);
    if (gia === null)
      throw new BadRequestException(
        laDonLanding(order.source) ? 'Chưa nhập giá chốt với khách' : 'Phòng này chưa gửi báo giá',
      );

    await tx.order.update({
      where: { id },
      data: {
        status: OrderStatus.CLOSED,
        finalAmount: gia,
        closedAt: new Date(),
        closeNote: dto.note,
        updatedAt: new Date(),
      },
    });

    // SNAPSHOT bộ mốc — Admin sửa services.milestones sau này không đụng đơn đã chốt.
    await tx.$executeRaw`
      INSERT INTO order_milestones (order_id, seq, name)
      SELECT ${id}, m.seq, m.name
      FROM orders o JOIN services s ON s.id = o.service_id
      CROSS JOIN LATERAL unnest(s.milestones) WITH ORDINALITY AS m(name, seq)
      WHERE o.id = ${id}`;

    await activity.log(tx, {
      orderId: id, entity: 'orders', entityId: id, action: 'close', actorId: user.id,
      // QA-20: .toString() trên Decimal cho ra chuỗi "45000000" trong nhật ký,
      // trong khi mọi nơi khác finalAmount là số — client phải đoán kiểu.
      detail: { status: [order.status, OrderStatus.CLOSED], finalAmount: gia },
    });
  });

  if (deptId)
    await notify.push(
      (await notify.deptRecipients(null, id, deptId)).map((userId) => ({
        userId, orderId: id, type: NotifType.ORDER_CLOSED,
        title: `Đơn ${current.code} đã chốt`,
        body: 'Phòng bạn là phòng phụ trách. Bắt đầu cập nhật tiến độ thực hiện.',
      })),
    );
  await customerNotify.orderEvent(
    id, CustomerNotifType.ORDER_CLOSED,
    `Đơn ${current.code} đã được chốt`,
    'Cảm ơn bạn đã tin tưởng BeeOps. Chúng tôi sẽ cập nhật tiến độ vận chuyển.',
  );
}
