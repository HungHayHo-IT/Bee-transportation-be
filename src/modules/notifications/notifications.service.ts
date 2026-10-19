import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeptState, MilestoneStatus, OrderStatus, Role } from '@/common/enums';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  NotifPrefsDto, NotificationDto, RegisterStaffDeviceDto, SetPreferencesDto, TaskDto,
} from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * QA-23: trước đây cắt cứng 100 dòng mới nhất, không có tổng và không lật trang
   * được — thông báo cũ hơn coi như mất. Dùng chung vỏ PageResult với /orders.
   */
  async inbox(
    user: AuthenticatedUser,
    isRead?: boolean,
    page = 1,
    limit = 20,
  ): Promise<PageResult<NotificationDto>> {
    const where = { userId: user.id, ...(isRead === undefined ? {} : { isRead }) };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const items = rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      orderId: n.orderId,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));
    return { items, total, page, limit };
  }

  async unreadCount(user: AuthenticatedUser): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { userId: user.id, isRead: false } }) };
  }

  async markRead(user: AuthenticatedUser, ids?: number[], all?: boolean): Promise<{ updated: number }> {
    const where: Prisma.NotificationWhereInput = { userId: user.id, isRead: false };
    if (!all) where.id = { in: ids ?? [] };
    const res = await this.prisma.notification.updateMany({ where, data: { isRead: true } });
    return { updated: res.count };
  }

  async getPreferences(user: AuthenticatedUser): Promise<NotifPrefsDto> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { emailOff: true, pushOff: true },
    });
  }

  /**
   * `pushOff` tuỳ chọn để client cũ chỉ gửi `emailOff` vẫn chạy y như trước —
   * undefined nghĩa là "không đụng tới", không phải "xoá hết".
   */
  async setPreferences(user: AuthenticatedUser, dto: SetPreferencesDto): Promise<NotifPrefsDto> {
    return this.prisma.user.update({
      where: { id: user.id },
      data: { emailOff: dto.emailOff, ...(dto.pushOff === undefined ? {} : { pushOff: dto.pushOff }) },
      select: { emailOff: true, pushOff: true },
    });
  }

  /* ------------------------------------ Thiết bị nhận push của nhân viên (FCM) */

  /**
   * Idempotent theo fcmToken — app gọi lại mỗi lần mở và mỗi lần Firebase xoay
   * token, không được sinh dòng trùng (một dòng trùng = một push nhân đôi).
   *
   * `update` đổi luôn userId: cùng một máy, người trước đăng xuất và người sau
   * đăng nhập thì Firebase trả lại đúng token cũ. Không chuyển chủ thì máy đó
   * vẫn nhận thông báo nội bộ của người cũ.
   */
  async registerDevice(user: AuthenticatedUser, dto: RegisterStaffDeviceDto): Promise<void> {
    const now = new Date();
    await this.prisma.userDevice.upsert({
      where: { fcmToken: dto.fcmToken },
      update: { userId: user.id, platform: dto.platform, lastSeenAt: now },
      create: { userId: user.id, fcmToken: dto.fcmToken, platform: dto.platform, lastSeenAt: now },
    });
    // fcm_token UNIQUE chỉ có hiệu lực TRONG một bảng. Máy này trước đó có thể
    // đang là máy của một khách hàng, hoặc từng gửi form báo giá công khai khi
    // chưa đăng nhập. Còn sót dòng cũ ở hai nơi kia thì cùng một máy nhận push
    // của cả hai phía — dữ liệu khách rơi sang thiết bị nhân viên.
    await this.prisma.customerDevice.deleteMany({ where: { fcmToken: dto.fcmToken } });
    await this.prisma.quoteRequest.updateMany({
      where: { fcmToken: dto.fcmToken, customerId: null },
      data: { fcmToken: null },
    });
  }

  /**
   * Gọi lúc đăng xuất. `where` ràng CẢ userId để không ai huỷ được token của máy
   * người khác khi đoán/bắt được token đó. deleteMany chứ không delete: token
   * không còn thì coi như đã xong — 204, không 404.
   */
  async unregisterDevice(user: AuthenticatedUser, fcmToken: string): Promise<void> {
    await this.prisma.userDevice.deleteMany({ where: { fcmToken, userId: user.id } });
  }

  /**
   * "Việc của tôi" — không phải bảng riêng, là truy vấn tổng hợp theo vai trò.
   * Một người kiêm nhiều vai trò thì gộp cả các nhánh.
   */
  async myTasks(user: AuthenticatedUser): Promise<TaskDto[]> {
    const tasks: TaskDto[] = [];

    if (user.roles.includes(Role.SALE)) {
      const rows = await this.prisma.order.findMany({
        where: {
          createdBy: user.id,
          status: OrderStatus.AWAITING_SELECTION,
        },
        select: { id: true, code: true, status: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
        take: 50,
      });
      for (const o of rows)
        tasks.push({
          orderId: o.id,
          code: o.code,
          reason:
            o.status === OrderStatus.AWAITING_SELECTION
              ? 'Chờ bạn chọn báo giá'
              : 'Chờ khách xác nhận',
          since: o.updatedAt,
        });
    }

    if (user.departmentId !== null && (user.roles.includes(Role.MANAGER) || user.roles.includes(Role.STAFF))) {
      const isManager = user.roles.includes(Role.MANAGER);
      const rows = await this.prisma.orderDepartment.findMany({
        where: {
          departmentId: user.departmentId,
          OR: [
            { state: DeptState.PENDING },
            { state: DeptState.CLAIMED, ...(isManager ? {} : { assigneeId: user.id }) },
          ],
        },
        select: { orderId: true, state: true, distributedAt: true, order: { select: { code: true } } },
        // Moi nhat truoc: lay 50 dong CU NHAT thi don vua phan ve co the khong
        // lot vao danh sach chut nao khi phong dang ton nhieu don cho.
        orderBy: { distributedAt: 'desc' },
        take: 50,
      });
      for (const r of rows)
        tasks.push({
          orderId: r.orderId,
          code: r.order.code,
          reason: r.state === DeptState.PENDING ? 'Đơn mới chờ tiếp nhận' : 'Đã nhận, chưa báo giá',
          since: r.distributedAt,
        });

      tasks.push(...(await this.milestoneTasks(user)));
    }

    // Moi nhat len dau — cung thu tu voi Hang doi phong, xem QueueService.
    return tasks.sort((a, b) => b.since.getTime() - a.since.getTime());
  }

  /**
   * Đơn đã chốt mà bộ mốc còn dang dở.
   *
   * QA đo ngày 16-09: `close` xong là đơn bốc hơi khỏi mọi danh sách của người
   * phụ trách — /quotes/queue chỉ lấy state pending/claimed/quoted nên đơn đã
   * WON rớt ra, /orders?assigneeId cũng không giữ nó lại — trong khi việc thật
   * (cập nhật mốc giao hàng) mới bắt đầu. Người phụ trách chỉ còn đường vào qua
   * thông báo cũ trong hộp thư, tức là không còn gì nhắc.
   *
   * Nguồn việc này đi từ orderDepartment chứ không từ order, để dùng lại đúng
   * luật người-nhận của nhánh Manager/Staff ngay trên: Manager thấy cả phòng,
   * Staff chỉ thấy đơn mình cầm. Đi từ order thì mọi nhân viên trong phòng đều
   * thấy mọi đơn đang chạy và my-tasks thành danh sách rác.
   */
  private async milestoneTasks(user: AuthenticatedUser): Promise<TaskDto[]> {
    const isManager = user.roles.includes(Role.MANAGER);
    const rows = await this.prisma.orderDepartment.findMany({
      where: {
        departmentId: user.departmentId!,
        state: DeptState.WON,
        ...(isManager ? {} : { assigneeId: user.id }),
        order: {
          // Chỉ 'closed': tick mốc không còn đổi trạng thái đơn (migration 023),
          // nên mọi đơn đang giao đều nằm ở đây. Điều kiện còn mốc pending bên
          // dưới tự loại đơn đã giao xong.
          status: OrderStatus.CLOSED,
          milestones: { some: { status: MilestoneStatus.PENDING } },
        },
      },
      select: {
        orderId: true,
        order: {
          select: {
            code: true,
            closedAt: true,
            updatedAt: true,
            // Lấy id các mốc còn dở thay vì _count có điều kiện: chỉ cần con số
            // để ghi vào reason, mà cách này chạy trên mọi bản Prisma.
            milestones: { where: { status: MilestoneStatus.PENDING }, select: { id: true } },
          },
        },
      },
      orderBy: { order: { closedAt: 'asc' } },
      take: 50,
    });

    return rows.map((r) => ({
      orderId: r.orderId,
      code: r.order.code,
      reason: `Còn ${r.order.milestones.length} mốc chưa cập nhật`,
      // Đơn cũ chốt trước khi có cột closedAt vẫn phải xếp được thứ tự.
      since: r.order.closedAt ?? r.order.updatedAt,
    }));
  }
}
