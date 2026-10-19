import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerNotificationDto } from './dto/customer-notification.dto';

/**
 * Hộp thư của KHÁCH. Song song NotificationsService (của nhân viên) nhưng lọc
 * theo customer_id — không bao giờ chạm user_id. Hai cột FK tách rời chính là thứ
 * làm ranh giới này không thể lẫn: customerId 5 không khớp dòng của userId 5.
 */
@Injectable()
export class CustomerNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async inbox(
    customerId: number,
    isRead?: boolean,
    page = 1,
    limit = 20,
  ): Promise<PageResult<CustomerNotificationDto>> {
    const where = { customerId, ...(isRead === undefined ? {} : { isRead }) };
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
      quoteRequestId: n.quoteRequestId,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));
    return { items, total, page, limit };
  }

  async unreadCount(customerId: number): Promise<{ count: number }> {
    return {
      count: await this.prisma.notification.count({ where: { customerId, isRead: false } }),
    };
  }

  /** where ràng CẢ customerId: khách đoán được id cũng không đánh dấu hộ người khác. */
  async markRead(customerId: number, ids?: number[], all?: boolean): Promise<{ updated: number }> {
    const where: Prisma.NotificationWhereInput = { customerId, isRead: false };
    if (!all) where.id = { in: ids ?? [] };
    const res = await this.prisma.notification.updateMany({ where, data: { isRead: true } });
    return { updated: res.count };
  }

  async getPushOff(customerId: number): Promise<{ pushOff: string[] }> {
    const c = await this.prisma.customerAccount.findUniqueOrThrow({
      where: { id: customerId },
      select: { pushOff: true },
    });
    return { pushOff: c.pushOff };
  }

  async setPushOff(customerId: number, pushOff: string[]): Promise<{ pushOff: string[] }> {
    const c = await this.prisma.customerAccount.update({
      where: { id: customerId },
      data: { pushOff },
      select: { pushOff: true },
    });
    return { pushOff: c.pushOff };
  }
}
