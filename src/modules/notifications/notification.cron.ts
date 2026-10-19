import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotifType } from '@/common/enums';
import { MailService } from '@/common/mail/mail.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationEvents } from './notification-events.service';

interface PendingMail {
  id: number;
  email: string;
  title: string;
  body: string | null;
  order_id: number | null;
  should_send: boolean;
}

/** Dòng vừa chèn, dùng để đẩy realtime — INSERT ở đây không đi qua NotifyService. */
interface InsertedRow {
  user_id: number;
  order_id: number | null;
  type: string;
  title: string;
}

@Injectable()
export class NotificationCron {
  private readonly logger = new Logger(NotificationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly events: NotificationEvents,
  ) {}

  /**
   * Hai cron dưới đây INSERT thẳng bằng SQL, KHÔNG qua NotifyService.push, nên bus
   * sự kiện không tự thấy gì. Thiếu bước này thì nhắc SLA và báo giá hết hiệu lực
   * vẫn phải chờ vòng poll — đúng thứ mà realtime sinh ra để bỏ đi.
   */
  private emitInserted(rows: InsertedRow[]): void {
    try {
      this.events.emit(
        rows.map((r) => ({
          userId: r.user_id,
          orderId: r.order_id,
          type: r.type as NotifType,
          title: r.title,
        })),
      );
    } catch (e) {
      this.logger.error({ err: e }, 'Đẩy thông báo realtime thất bại');
    }
  }

  /**
   * BƯỚC 1 nhận việc TRONG transaction (khóa chỉ sống tới COMMIT), BƯỚC 2 gửi ngoài.
   * Lấy MỌI dòng chưa xử lý — kể cả dòng sẽ không gửi. Nếu lọc email_off ngay trong
   * WHERE thì những dòng đó không bao giờ được chọn, emailed_at mãi NULL và hộp thư
   * đi không bao giờ cạn.
   *
   * `user_id IS NOT NULL` loại thông báo của khách: họ không nhận email nên
   * emailed_at ở null vĩnh viễn và sẽ bị quét lại mỗi hai phút. Tính đúng-sai đã
   * an toàn sẵn nhờ INNER JOIN users — đây chỉ là để bảng quét không phình.
   */
  @Cron(process.env.MAIL_FLUSH_CRON ?? '*/2 * * * *')
  async flushEmails(): Promise<void> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PendingMail[]>`
        SELECT n.id, n.title, n.body, n.order_id, u.email,
               (u.is_active AND NOT (n.type = ANY (u.email_off))) AS should_send
        FROM notifications n
        JOIN users u ON u.id = n.user_id
        WHERE n.emailed_at IS NULL AND n.user_id IS NOT NULL
        ORDER BY n.created_at
        LIMIT 50
        FOR UPDATE OF n SKIP LOCKED`;
      if (rows.length)
        await tx.notification.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { emailedAt: new Date() }, // = "cron đã xử lý", không phải "đã gửi"
        });
      return rows;
    });

    for (const r of claimed.filter((x) => x.should_send)) {
      const link = r.order_id ? this.mail.orderLink(r.order_id) : this.mail.baseUrl;
      try {
        await this.mail.send({
          to: r.email,
          subject: `[BeeOps] ${r.title}`,
          html: this.mail.layout(
            `<p>${r.body ?? r.title}</p><p><a href="${link}">Mở trên BeeOps</a></p>`,
          ),
        });
      } catch (e) {
        this.logger.error({ err: e, id: r.id }, 'Gửi email thất bại');
      }
    }
  }

  /**
   * Chống nhắc lặp ở mức (đơn, phòng, người nhận) qua dedupe_key + unique index.
   * Chống ở mức (đơn, type) là SAI: phòng A trễ trước sẽ khiến phòng B, C không
   * bao giờ được nhắc.
   */
  @Cron(process.env.SLA_CHECK_CRON ?? '*/15 * * * *')
  async checkSla(): Promise<void> {
    const rows = await this.prisma.$queryRaw<InsertedRow[]>`
      INSERT INTO notifications (user_id, order_id, type, title, body, dedupe_key)
      SELECT u.id, o.id, 'sla_late',
             'Đơn ' || o.code || ' quá hạn tiếp nhận',
             'Phòng ' || d.name || ' chưa tiếp nhận sau ' || s.sla_hours || ' giờ.',
             'sla_late:' || o.id || ':' || d.id || ':' || u.id
      FROM order_departments od
      JOIN orders o      ON o.id = od.order_id
      JOIN services s    ON s.id = o.service_id
      JOIN departments d ON d.id = od.department_id
      JOIN users u ON (u.department_id = d.id OR u.id IN (d.manager_id, o.created_by))
                  AND u.is_active
      WHERE od.state = 'pending'
        AND od.distributed_at < now() - (s.sla_hours || ' hours')::interval
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING user_id, order_id, type, title`;
    if (rows.length) this.logger.log(`SLA: tạo ${rows.length} nhắc việc quá hạn`);
    this.emitInserted(rows);
  }

  /** Báo giá hết hiệu lực -> nhắc sale. Cũng cần dedupe_key vì lặp theo thời gian. */
  @Cron(process.env.QUOTE_EXPIRY_CRON ?? '0 * * * *')
  async expireQuotes(): Promise<void> {
    const rows = await this.prisma.$queryRaw<InsertedRow[]>`
      INSERT INTO notifications (user_id, order_id, type, title, body, dedupe_key)
      SELECT o.created_by, o.id, 'quote_expired',
             'Báo giá của đơn ' || o.code || ' đã hết hiệu lực',
             'Phòng ' || d.name || ' báo giá hết hiệu lực ngày ' || od.valid_until || '.',
             'quote_expired:' || o.id || ':' || d.id
      FROM order_departments od
      JOIN orders o      ON o.id = od.order_id
      JOIN departments d ON d.id = od.department_id
      WHERE od.state = 'quoted'
        AND od.valid_until IS NOT NULL
        AND od.valid_until < current_date
        AND o.status IN ('quoting','awaiting_selection','awaiting_customer')
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING user_id, order_id, type, title`;
    if (rows.length) this.logger.log(`Hết hiệu lực: tạo ${rows.length} nhắc việc`);
    this.emitInserted(rows);
  }
}
