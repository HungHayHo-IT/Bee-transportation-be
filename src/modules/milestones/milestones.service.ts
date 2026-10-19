import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '@/common/activity/activity.service';
import { CustomerNotifType, MilestoneStatus, NotifType, OrderStatus, Role } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { CustomerNotifyService } from '../notifications/customer-notify.service';
import { NotifyService } from '../notifications/notify.service';
import { OrderMilestoneDto } from '../orders/dto/order-response.dto';
import { UpdateMilestoneDto } from './dto/milestone.dto';

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly customerNotify: CustomerNotifyService,
  ) {}

  /** `chiDoc` = đường XEM: dùng phạm vi đọc (orderReadWhere). Đường ghi bỏ trống
   *  để giữ phạm vi cũ — người chỉ được xem không được mượn nó để ghi. */
  private async scopedOrder(orderId: number, user: AuthenticatedUser, chiDoc = false) {
    const o = await this.prisma.order.findFirst({
      where: { AND: [{ id: orderId }, chiDoc ? this.scope.orderReadWhere(user) : this.scope.orderWhere(user)] },
      // completedAt de biet da ghi moc hoan thanh chua — ghi de len no moi lan
      // tick lai mot moc da xong se lam sai ngay hoan thanh.
      select: {
        id: true, code: true, status: true, departmentId: true, createdBy: true,
        completedAt: true,
      },
    });
    if (!o) throw new NotFoundException('Không tìm thấy đơn hàng');
    return o;
  }

  async list(orderId: number, user: AuthenticatedUser): Promise<OrderMilestoneDto[]> {
    await this.scopedOrder(orderId, user, true);
    const rows = await this.prisma.orderMilestone.findMany({
      where: { orderId },
      include: { user: { select: { fullName: true } } },
      orderBy: { seq: 'asc' },
    });
    return rows.map((m) => ({
      id: m.id,
      seq: m.seq,
      name: m.name,
      status: m.status,
      note: m.note,
      doneAt: m.doneAt,
      doneByName: m.user?.fullName ?? null,
    }));
  }

  async update(
    orderId: number,
    milestoneId: number,
    dto: UpdateMilestoneDto,
    user: AuthenticatedUser,
  ): Promise<OrderMilestoneDto[]> {
    const order = await this.scopedOrder(orderId, user);

    // Chỉ phòng phụ trách mới cập nhật được — kiểm tra ở service, không phải @Roles.
    if (!user.roles.includes(Role.ADMIN) && order.departmentId !== user.departmentId)
      throw new ForbiddenException('Chỉ phòng phụ trách mới cập nhật được tiến độ');

    const all = await this.prisma.orderMilestone.findMany({
      where: { orderId },
      orderBy: { seq: 'asc' },
    });
    if (!all.length) throw new BadRequestException('Đơn chưa chốt nên chưa có bộ mốc tiến độ');

    const target = all.find((m) => m.id === milestoneId);
    if (!target) throw new NotFoundException('Không tìm thấy mốc tiến độ');

    if (dto.status === MilestoneStatus.SKIPPED) {
      if (!dto.note)
        throw new BadRequestException('Bỏ qua mốc bắt buộc phải ghi chú lý do');
      // Mốc cuối luôn là Nghiệm thu — bỏ qua nó là đóng đơn mà không ai xác nhận giao hàng.
      if (target.seq === all[all.length - 1].seq)
        throw new BadRequestException('Không được bỏ qua mốc cuối (Nghiệm thu)');
    }

    if (dto.status !== MilestoneStatus.PENDING) {
      const blocking = all.find((m) => m.seq < target.seq && m.status === MilestoneStatus.PENDING);
      if (blocking)
        throw new BadRequestException(`Phải xử lý mốc "${blocking.name}" trước`);
    }

    // Cờ ghi trong transaction — remaining/current lúc đó mới là giá trị chốt;
    // truy vấn lại sau transaction có thể ăn dữ liệu đã bị request khác đổi tiếp.
    let justCompleted = false;

    await this.prisma.$transaction(async (tx) => {
      await tx.orderMilestone.update({
        where: { id: milestoneId },
        data: {
          status: dto.status,
          note: dto.note,
          doneBy: dto.status === MilestoneStatus.PENDING ? null : user.id,
          doneAt: dto.status === MilestoneStatus.PENDING ? null : new Date(),
        },
      });

      // Tick mốc KHÔNG còn đổi trạng thái đơn (migration 023). Đơn chốt rồi thì
      // đứng ở 'closed'; tiến độ giao hàng là việc của tab Tiến độ.
      //
      // Nhưng VẪN ghi completed_at khi tick hết mốc: đó là một cái mốc thời gian
      // riêng, và bộ lọc "theo ngày hoàn thành" ở danh sách đơn đọc đúng cột này.
      // Bỏ nó đi là làm hỏng một bộ lọc mà không ai ngờ tới.
      const remaining = await tx.orderMilestone.count({
        where: { orderId, status: MilestoneStatus.PENDING },
      });
      if (remaining === 0 && order.status === OrderStatus.CLOSED && order.completedAt === null) {
        await tx.order.update({
          where: { id: orderId },
          data: { completedAt: new Date(), updatedAt: new Date() },
        });
        justCompleted = true;
      }

      await this.activity.log(tx, {
        orderId, entity: 'order_milestones', entityId: milestoneId,
        action: 'milestone', actorId: user.id,
        detail: { name: target.name, status: [target.status, dto.status] },
      });
    });

    await this.notify.push([
      {
        userId: order.createdBy,
        orderId,
        type: NotifType.MILESTONE_UPDATED,
        title: `Đơn ${order.code}: ${target.name}`,
        body: dto.status === MilestoneStatus.DONE ? 'Đã hoàn thành mốc.' : 'Mốc được bỏ qua.',
      },
    ]);

    // Khách chỉ quan tâm mốc ĐÃ XONG. Mốc bị bỏ qua là chuyện điều hành nội bộ.
    //
    // Chặn DONE -> DONE: lưu lại mốc đã xong (sửa ghi chú chẳng hạn) không phải
    // sự kiện mới với khách. Nhân viên chịu được MILESTONE_UPDATED trùng vì nó
    // nằm trong hộp thư, còn đây là push thẳng ra điện thoại và dòng của khách
    // không có dedupe_key để chặn ở tầng DB.
    if (dto.status === MilestoneStatus.DONE && target.status !== MilestoneStatus.DONE)
      await this.customerNotify.orderEvent(
        orderId, CustomerNotifType.ORDER_MILESTONE,
        `Đơn ${order.code}: ${target.name}`,
      );

    if (justCompleted)
      await this.customerNotify.orderEvent(
        orderId, CustomerNotifType.ORDER_COMPLETED,
        `Đơn ${order.code} đã hoàn thành`,
        'Toàn bộ mốc hành trình đã xong.',
      );

    return this.list(orderId, user);
  }
}
