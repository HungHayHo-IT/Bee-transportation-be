import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { canReadAllOrders } from '@/common/scope/can-read-all-orders';
import { ScopeService } from '@/common/scope/scope.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { QuoteHistoryDto, QuoteHistoryEntryDto } from './dto/quote.dto';

/** Một phần tử trong cột jsonb quote_history — khóa snake_case như lúc ghi. */
interface RawEntry {
  version?: number;
  amount?: string | number | null;
  scope_note?: string | null;
  lead_time?: string | null;
  valid_until?: string | null;
  by?: number | null;
  at?: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * QA-16: quote_history được ghi mỗi lần báo giá lại nhưng không có đường nào đọc ra.
 * Tách thành service riêng để quotes.service.ts không phình quá 300 dòng.
 */
@Injectable()
export class QuoteHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async history(
    orderId: number,
    deptId: number,
    user: AuthenticatedUser,
  ): Promise<QuoteHistoryDto> {
    const order = await this.prisma.order.findFirst({
      where: { AND: [{ id: orderId }, this.scope.orderReadWhere(user)] },
      select: { createdBy: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn');

    // Báo giá kín: cùng luật với visibleDepartments() ở orders.mapper — phòng khác
    // không được đọc lịch sử giá của nhau, kể cả bản đã bị ghi đè.
    if (!canReadAllOrders(user) && order.createdBy !== user.id && user.departmentId !== deptId)
      throw new ForbiddenException('Bạn không xem được báo giá của phòng khác');

    const od = await this.prisma.orderDepartment.findUnique({
      where: { orderId_departmentId: { orderId, departmentId: deptId } },
      select: {
        quoteVersion: true,
        quoteHistory: true,
        department: { select: { name: true } },
      },
    });
    if (!od) throw new NotFoundException('Phòng ban này không được phân phối đơn');

    const raw: RawEntry[] = Array.isArray(od.quoteHistory)
      ? (od.quoteHistory as unknown as RawEntry[])
      : [];

    const senderIds = [...new Set(raw.map((e) => e.by).filter((v): v is number => !!v))];
    const senders = senderIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(senders.map((u) => [u.id, u.fullName]));

    const history: QuoteHistoryEntryDto[] = raw.map((e, i) => ({
      version: typeof e.version === 'number' ? e.version : i + 1,
      // amount ra khỏi jsonb dưới dạng chuỗi numeric — ép về number cho client.
      amount: e.amount === null || e.amount === undefined ? null : Number(e.amount),
      scopeNote: str(e.scope_note),
      leadTime: str(e.lead_time),
      validUntil: str(e.valid_until),
      sentById: e.by ?? null,
      sentByName: e.by ? (names.get(e.by) ?? null) : null,
      at: str(e.at),
    }));
    history.sort((a, b) => a.version - b.version);

    return {
      departmentId: deptId,
      departmentName: od.department.name,
      currentVersion: od.quoteVersion,
      history,
    };
  }
}
