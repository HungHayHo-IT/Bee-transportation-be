import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { FcmService } from '@/common/fcm/fcm.service';
import { PrismaService } from '@/common/prisma/prisma.service';

/** Dòng đã claim. Tên cột snake_case vì đi thẳng từ $queryRaw. */
interface PendingPush {
  id: number;
  /** Khác null = dòng của NHÂN VIÊN. Loại trừ nhau với customer_id/quote_request_id
   *  theo ràng buộc notifications_owner_ck. */
  user_id: number | null;
  customer_id: number | null;
  quote_request_id: number | null;
  order_id: number | null;
  type: string;
  title: string;
  body: string | null;
}

const CLAIM_LIMIT = 100;

/**
 * Đẩy thông báo ra FCM cho CẢ HAI loại chủ thể: nhân viên (user_devices) và khách
 * (customer_devices + token vãng lai trên quote_requests). Tách khỏi
 * NotificationCron (kênh email của nhân viên) — hai kênh, hai vòng đời, hai file.
 *
 * Cùng khuôn với flushEmails: BƯỚC 1 claim trong transaction (khóa chỉ sống tới
 * COMMIT), BƯỚC 2 gửi ngoài.
 */
@Injectable()
export class PushCron {
  private readonly logger = new Logger(PushCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  @Cron(process.env.PUSH_FLUSH_CRON ?? '*/30 * * * * *')
  async flushPush(): Promise<void> {
    // Thiếu/hỏng credential Firebase: KHÔNG claim. Claim rồi bỏ qua sẽ đóng dấu
    // pushed_at cho những dòng chưa hề được gửi — khi credential được khôi phục,
    // các dòng đó vĩnh viễn không còn cơ hội đẩy lại.
    if (!this.fcm.isEnabled) return;

    const claimed = await this.claim();
    if (!claimed.length) return;

    // Sau khi claim đã COMMIT, mọi lỗi ở đây chỉ làm MẤT push của tối đa 100 dòng
    // đã đóng dấu pushed_at — không được để nó văng ra khỏi @Cron (unhandled
    // rejection) và cũng không có gì để rollback. Nuốt và log.
    try {
      const tokensOf = await this.resolveTokens(claimed);
      const dead = new Set<string>();

      for (const row of claimed) {
        const tokens = tokensOf.get(row.id) ?? [];
        if (!tokens.length) continue;
        const res = await this.fcm.sendEach(tokens, {
          title: row.title,
          body: row.body ?? '',
          data: {
            // id để client tap vào push là đánh dấu đã đọc được ngay, không phải
            // gọi thêm một lượt hộp thư để dò dòng tương ứng.
            id: String(row.id),
            type: row.type,
            orderId: String(row.order_id ?? ''),
            quoteRequestId: String(row.quote_request_id ?? ''),
          },
        });
        res.dead.forEach((t) => dead.add(t));
      }

      await this.dropDeadTokens([...dead]);
    } catch (e) {
      this.logger.error({ err: e, count: claimed.length }, 'Đẩy push thất bại sau khi claim');
    }
  }

  /**
   * `pushed_at IS NULL` là bộ lọc DUY NHẤT. Vế `user_id IS NULL` cũ đã bỏ: từ
   * migration 019 cron này phục vụ cả nhân viên lẫn khách, việc tách hai loại
   * chủ thể chuyển hẳn xuống resolveTokens() — nơi mỗi dòng đọc token từ đúng
   * bảng của chủ nó. Giữ việc tách ở câu WHERE thì phải claim hai lượt, hai lần
   * round-trip và hai đường code dễ lệch nhau.
   *
   * Vị từ của notifications_push_idx đã được mở rộng cho khớp đúng câu WHERE
   * này (migration 019) — lệch một vế là planner bỏ index, seq scan mỗi 30 giây.
   *
   * Đặt pushed_at NGAY ở đây, trước khi gọi FCM: giá trị này nghĩa là "cron đã xử
   * lý", không phải "đã gửi". Thà mất một push khi process chết giữa chừng còn hơn
   * bắn trùng mỗi vòng cron.
   */
  private async claim(): Promise<PendingPush[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PendingPush[]>`
        SELECT id, user_id, customer_id, quote_request_id, order_id, type, title, body
        FROM notifications
        WHERE pushed_at IS NULL
        ORDER BY created_at
        LIMIT ${CLAIM_LIMIT}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length)
        await tx.notification.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { pushedAt: new Date() },
        });
      return rows;
    });
  }

  /**
   * id thông báo -> danh sách token đã lọc push_off.
   *
   * Chia theo CHỦ SỞ HỮU trước rồi mới tra bảng, và hai nhánh không bao giờ ghi
   * đè nhau: users.id và customer_accounts.id là hai sequence độc lập trùng nhau
   * dày đặc, nên gộp một map chung theo id là đẩy thông báo nội bộ ra máy khách.
   * Mỗi nhánh cũng tự thoát sớm khi lượt claim không có dòng loại đó — luồng
   * khách đang chạy thật trên production không tốn thêm round-trip nào.
   */
  private async resolveTokens(rows: PendingPush[]): Promise<Map<number, string[]>> {
    const out = new Map<number, string[]>();
    await Promise.all([
      this.resolveStaffTokens(rows.filter((r) => r.user_id !== null), out),
      this.resolveCustomerTokens(rows.filter((r) => r.user_id === null), out),
    ]);
    return out;
  }

  /** Nhánh NHÂN VIÊN: token nằm ở user_devices, tuỳ chọn tắt nằm ở users.push_off. */
  private async resolveStaffTokens(rows: PendingPush[], out: Map<number, string[]>): Promise<void> {
    const userIds = [...new Set(rows.map((r) => r.user_id).filter((x): x is number => x !== null))];
    if (!userIds.length) return;

    const [devices, users] = await Promise.all([
      this.prisma.userDevice.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, fcmToken: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, pushOff: true },
      }),
    ]);

    const byUser = new Map<number, string[]>();
    for (const d of devices) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d.fcmToken]);
    const offOf = new Map(users.map((u) => [u.id, new Set(u.pushOff)]));

    for (const r of rows) {
      if (r.user_id === null) continue;
      if (offOf.get(r.user_id)?.has(r.type)) continue;
      out.set(r.id, byUser.get(r.user_id) ?? []);
    }
  }

  /**
   * Nhánh KHÁCH — giữ nguyên từng bước của bản đang chạy trên production. `rows`
   * vào đây đã được lọc user_id IS NULL nên tương đương hệt bộ lọc cũ ở claim().
   */
  private async resolveCustomerTokens(
    rows: PendingPush[],
    out: Map<number, string[]>,
  ): Promise<void> {
    if (!rows.length) return;
    const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((x): x is number => x !== null))];
    const guestQrIds = [
      ...new Set(
        rows.filter((r) => r.customer_id === null)
          .map((r) => r.quote_request_id)
          .filter((x): x is number => x !== null),
      ),
    ];

    const [devices, guests, accounts] = await Promise.all([
      customerIds.length
        ? this.prisma.customerDevice.findMany({
            where: { customerId: { in: customerIds } },
            select: { customerId: true, fcmToken: true },
          })
        : Promise.resolve([]),
      guestQrIds.length
        ? this.prisma.quoteRequest.findMany({
            where: { id: { in: guestQrIds }, fcmToken: { not: null } },
            select: { id: true, fcmToken: true },
          })
        : Promise.resolve([]),
      customerIds.length
        ? this.prisma.customerAccount.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, pushOff: true },
          })
        : Promise.resolve([]),
    ]);

    const byCustomer = new Map<number, string[]>();
    for (const d of devices)
      byCustomer.set(d.customerId, [...(byCustomer.get(d.customerId) ?? []), d.fcmToken]);
    const byGuest = new Map(guests.map((g) => [g.id, g.fcmToken as string]));
    const offOf = new Map(accounts.map((a) => [a.id, new Set(a.pushOff)]));

    for (const r of rows) {
      if (r.customer_id !== null) {
        if (offOf.get(r.customer_id)?.has(r.type)) continue;
        // Không cần khử trùng lặp ở đây: fcm_token UNIQUE toàn cục trên
        // customer_devices (migration 014) nên một khách không thể có hai dòng
        // thiết bị cùng token, và mỗi dòng thông báo chỉ đi đúng MỘT trong hai
        // nhánh (customer_id XOR quote_request_id) — không bao giờ cộng dồn từ
        // cả hai nguồn trong cùng một lượt gửi.
        out.set(r.id, byCustomer.get(r.customer_id) ?? []);
        continue;
      }
      const guest = r.quote_request_id !== null ? byGuest.get(r.quote_request_id) : undefined;
      out.set(r.id, guest ? [guest] : []);
    }
  }

  /**
   * Không dọn thì token chết tích tụ và mỗi vòng cron tốn một round-trip để nhận
   * lại đúng một lỗi.
   */
  private async dropDeadTokens(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    try {
      const where: Prisma.StringFilter = { in: tokens };
      // Cùng một token chỉ tồn tại ở đúng MỘT trong ba nơi (xem registerDevice),
      // nhưng xoá cả ba là rẻ và không cần biết token vừa chết thuộc loại nào.
      await this.prisma.userDevice.deleteMany({ where: { fcmToken: where } });
      await this.prisma.customerDevice.deleteMany({ where: { fcmToken: where } });
      await this.prisma.quoteRequest.updateMany({
        where: { fcmToken: where },
        data: { fcmToken: null },
      });
    } catch (e) {
      this.logger.error({ err: e, count: tokens.length }, 'Dọn token chết thất bại');
    }
  }
}
