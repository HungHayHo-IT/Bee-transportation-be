import { Injectable, Logger } from '@nestjs/common';
import { CustomerNotifType, NotifType, Role } from '@/common/enums';
import { PrismaService, Tx } from '@/common/prisma/prisma.service';
import { chiLaSale } from '@/common/scope/chi-la-sale';
import { NotificationEvents } from './notification-events.service';

export interface NotifyInput {
  /** null = đơn chưa có Sale (khách tự gửi từ landing) — bỏ qua, không ai nhận. */
  userId: number | null;
  orderId?: number | null;
  /** Ngữ cảnh cho thông báo ở tầng yêu cầu báo giá — lúc đó chưa có đơn nào. */
  quoteRequestId?: number | null;
  type: NotifType;
  title: string;
  body?: string;
  /** Chỉ đặt cho loại LẶP THEO THỜI GIAN (sla_late, quote_expired). */
  dedupeKey?: string;
}

/**
 * Thông báo gửi cho khách. `customerId` null = khách vãng lai; lúc đó
 * `quoteRequestId` là thứ duy nhất neo được dòng này về một cái máy (token nằm ở
 * quote_requests.fcm_token). CHECK notifications_owner_ck ở DB giữ đúng luật này.
 */
export interface CustomerNotifyInput {
  customerId: number | null;
  quoteRequestId: number | null;
  orderId?: number | null;
  type: CustomerNotifType;
  title: string;
  body?: string;
}

/**
 * Ghi thông báo là việc PHỤ — không bao giờ được làm hỏng việc chính.
 * Gọi NGOÀI transaction: SMTP/ghi chậm không được giữ khóa DB.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: NotificationEvents,
  ) {}

  async push(tatCa: NotifyInput[]): Promise<void> {
    const rows = tatCa.filter((r): r is NotifyInput & { userId: number } => r.userId !== null);
    if (!rows.length) return;
    try {
      await this.prisma.notification.createMany({
        data: rows.map((r) => ({
          userId: r.userId,
          orderId: r.orderId ?? null,
          quoteRequestId: r.quoteRequestId ?? null,
          type: r.type,
          title: r.title,
          body: r.body,
          dedupeKey: r.dedupeKey,
        })),
        skipDuplicates: true,
      });
    } catch (e) {
      this.logger.error({ err: e }, 'Ghi thông báo thất bại');
      return; // Chưa ghi được thì đừng báo realtime cho client đi tìm dòng không có.
    }

    // Đẩy realtime SAU khi ghi xong: client nhận tín hiệu rồi gọi lại API, dữ liệu
    // phải có sẵn ở đó. try riêng — bus hỏng không được biến một lần ghi ĐÃ thành
    // công thành dòng log "ghi thất bại".
    try {
      this.events.emit(rows);
    } catch (e) {
      this.logger.error({ err: e }, 'Đẩy thông báo realtime thất bại');
    }
  }

  /**
   * Đối xứng push() nhưng cho khách hàng. KHÔNG emit SSE: đó là kênh của nhân
   * viên, và NotificationEvent.userId sẽ bị so nhầm với customerId.
   *
   * Không đặt pushedAt — để null chính là "chưa đẩy", cron flushPush claim sau.
   */
  async pushCustomer(rows: CustomerNotifyInput[]): Promise<void> {
    if (!rows.length) return;
    try {
      await this.prisma.notification.createMany({
        data: rows.map((r) => ({
          userId: null,
          customerId: r.customerId,
          quoteRequestId: r.quoteRequestId,
          orderId: r.orderId ?? null,
          type: r.type,
          title: r.title,
          body: r.body,
        })),
      });
    } catch (e) {
      this.logger.error({ err: e }, 'Ghi thông báo khách hàng thất bại');
    }
  }

  /**
   * Người nhận của một phòng: MỌI thành viên đang hoạt động của phòng, cộng trưởng
   * phòng và người được gán.
   *
   * Hai vế sau KHÔNG thừa. `departments.manager_id` và `users.department_id` là hai
   * quan hệ tách rời — trưởng phòng có thể không nằm trong biên chế phòng; và Admin
   * gán được người ngoài phòng phụ trách đơn. Bỏ chúng đi là hai người này mất sạch
   * thông báo về chính việc họ đang chịu trách nhiệm.
   */
  async deptRecipients(tx: Tx | null, orderId: number, departmentId: number): Promise<number[]> {
    const client = tx ?? this.prisma;
    const [dept, od, members] = await Promise.all([
      client.department.findUnique({
        where: { id: departmentId },
        select: { manager: { select: { id: true, isActive: true } } },
      }),
      client.orderDepartment.findUnique({
        where: { orderId_departmentId: { orderId, departmentId } },
        select: { assignee: { select: { id: true, isActive: true } } },
      }),
      client.user.findMany({
        where: { departmentId, isActive: true },
        select: { id: true, roles: true },
      }),
    ]);
    // Tài khoản đã khóa thì bỏ — cron SLA đã lọc `u.is_active`, hai chỗ phải khớp.
    const extra = [dept?.manager, od?.assignee].filter(
      (u): u is { id: number; isActive: boolean } => u?.isActive === true,
    );
    /* Người CHỈ là Sale không còn đọc được đơn của phòng (xem chiLaSale), nên
       cũng không được nhận thông báo của phòng — gửi đi là mời họ bấm vào một
       đơn trả 404. Trưởng phòng và người được gán việc vẫn vào qua `extra`, kể
       cả khi họ kiêm sale. */
    const ids = [...members.filter((u) => !chiLaSale(u.roles)), ...extra].map((u) => u.id);
    return [...new Set(ids)];
  }

  async admins(): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { has: 'admin' },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Admin VÀ Sale — hai vai trò chịu trách nhiệm yêu cầu báo giá chưa vào đơn.
   */
  async adminsAndSales(): Promise<number[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { hasSome: [Role.ADMIN, Role.SALE] },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
