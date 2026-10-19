import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PageResult } from '@/common/dto/pagination.dto';
import { REVENUE_STATUSES } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { canSeeOrderAmount } from '@/common/scope/money.visibility';
import { ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { statusLabel } from '../orders/order-state.helper';
import { OrderListItemDto } from '../orders/dto/order-response.dto';
import { ORDER_LIST_INCLUDE, toListItem } from '../orders/orders.mapper';
import { DrillFilterDto } from './dto/dashboard.dto';
import { sizeWhere } from './size-buckets';
import { customerDisplayName } from '@/common/customer-display-name';

@Injectable()
export class DrillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /** Danh sách đơn phía sau một điểm biểu đồ. Luôn AND với scope như mọi query order. */
  private where(user: AuthenticatedUser, f: DrillFilterDto): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [this.scope.orderWhere(user)];

    if (f.status) and.push({ status: f.status });
    if (f.revenueOnly === 'true') and.push({ status: { in: REVENUE_STATUSES } });
    if (f.departmentId) and.push({ departments: { some: { departmentId: f.departmentId } } });
    if (f.userId) and.push({ OR: [{ createdBy: f.userId }, { departments: { some: { assigneeId: f.userId } } }] });

    if (f.dimension && f.key !== undefined) {
      switch (f.dimension) {
        case 'service':
          and.push({ service: { code: f.key } });
          break;
        case 'customer':
          and.push({ customerId: f.key ? Number(f.key) : null });
          break;
        case 'sale':
          and.push({ createdBy: Number(f.key) });
          break;
        case 'department':
          and.push({ departmentId: f.key ? Number(f.key) : null });
          break;
        case 'size': {
          // Khóa lạ (nhóm đã đổi mốc chia) thì bỏ qua vế này thay vì trả bừa toàn
          // bộ đơn — người dùng thấy danh sách rộng hơn cột họ bấm là hiểu sai số.
          const bucket = sizeWhere(f.key);
          and.push(bucket ?? { id: -1 });
          break;
        }
        case 'route': {
          const [from, to] = f.key.split('→').map((x) => x.trim());
          and.push({
            originProvince: from === '?' ? null : from,
            destinationProvince: to === '?' ? null : to,
          });
          break;
        }
      }
    }

    // Điểm trên biểu đồ doanh thu là theo closed_at, nên drill cũng lọc theo closed_at.
    const col = f.revenueOnly === 'true' || f.dimension ? 'closedAt' : 'createdAt';
    if (f.fromDate || f.toDate)
      and.push({
        [col]: {
          ...(f.fromDate ? { gte: new Date(f.fromDate) } : {}),
          ...(f.toDate ? { lt: new Date(new Date(f.toDate).getTime() + 86400000) } : {}),
        },
      } as Prisma.OrderWhereInput);

    return { AND: and };
  }

  async drill(user: AuthenticatedUser, f: DrillFilterDto): Promise<PageResult<OrderListItemDto>> {
    const where = this.where(user, f);
    // Giữ đúng mặc định 500 của bản cũ (`take: f.limit ?? 500`) để không thu
    // hẹp hành vi sẵn có của màn drill-down; DTO đã tự chặn limit > 500.
    const limit = f.limit ?? 500;
    const page = f.page ?? 1;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => toListItem(r, user)), total, page, limit };
  }

  /**
   * Excel KHÔNG đi qua DTO nên phải tự gọi canSeeOrderAmount cho TỪNG DÒNG.
   * Quên chỗ này là mở một đường vòng để lộ doanh thu hàng loạt chỉ bằng một cú bấm.
   */
  async exportExcel(user: AuthenticatedUser, f: DrillFilterDto): Promise<Buffer> {
    const rows = await this.prisma.order.findMany({
      where: this.where(user, f),
      include: ORDER_LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BeeOps';
    const ws = wb.addWorksheet('Đơn hàng');
    ws.columns = [
      { header: 'Mã đơn', key: 'code', width: 20 },
      { header: 'Dịch vụ', key: 'service', width: 34 },
      { header: 'Khách hàng', key: 'customer', width: 30 },
      { header: 'Tuyến', key: 'route', width: 28 },
      { header: 'Trạng thái', key: 'status', width: 20 },
      { header: 'Sale', key: 'sale', width: 22 },
      { header: 'Phòng phụ trách', key: 'dept', width: 24 },
      { header: 'Doanh thu (VND)', key: 'amount', width: 18 },
      { header: 'Ngày tạo', key: 'createdAt', width: 20 },
      { header: 'Ngày chốt', key: 'closedAt', width: 20 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const o of rows) {
      const visible = canSeeOrderAmount(user, o);
      ws.addRow({
        code: o.code,
        service: o.service.name,
        customer: customerDisplayName(o.customer) ?? '',
        route: `${o.originProvince ?? '?'} → ${o.destinationProvince ?? '?'}`,
        status: statusLabel(o.status),
        sale: o.creator?.fullName ?? '',
        dept: o.department?.name ?? '',
        // Không có quyền -> ô TRỐNG, không phải số 0 (0 đọc thành "đơn không doanh thu").
        amount: visible && o.finalAmount !== null ? Number(o.finalAmount) : null,
        createdAt: o.createdAt,
        closedAt: o.closedAt,
      });
    }
    ws.getColumn('amount').numFmt = '#,##0';
    ws.getColumn('createdAt').numFmt = 'dd/mm/yyyy hh:mm';
    ws.getColumn('closedAt').numFmt = 'dd/mm/yyyy hh:mm';

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
