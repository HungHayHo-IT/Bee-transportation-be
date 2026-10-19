import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderStatus, REVENUE_STATUSES } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ReportScope, ScopeService } from '@/common/scope/scope.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { dateRange, revenueFilter, TRUNC } from './dashboard-scope.helper';
import {
  DashboardFilterDto, RevenueByDto, RevenueFilterDto, RevenuePointDto, SummaryDto,
} from './dto/dashboard.dto';
import { sizeExpression } from './size-buckets';

interface Dimension {
  key: Prisma.Sql;
  label: Prisma.Sql;
  join: Prisma.Sql;
  /** Mặc định xếp theo doanh thu giảm dần; chiều nào có trục tự nhiên thì ghi đè. */
  order?: Prisma.Sql;
}

const DIMENSIONS: Record<string, Dimension> = {
  service: {
    key: Prisma.sql`s.code`,
    label: Prisma.sql`s.name`,
    join: Prisma.sql`JOIN services s ON s.id = o.service_id`,
  },
  route: {
    key: Prisma.sql`coalesce(o.origin_province,'?') || ' → ' || coalesce(o.destination_province,'?')`,
    label: Prisma.sql`coalesce(o.origin_province,'?') || ' → ' || coalesce(o.destination_province,'?')`,
    join: Prisma.empty,
  },
  customer: {
    key: Prisma.sql`o.customer_id::text`,
    label: Prisma.sql`coalesce(c.company_name,'(không rõ)')`,
    join: Prisma.sql`LEFT JOIN customers c ON c.id = o.customer_id`,
  },
  sale: {
    key: Prisma.sql`o.created_by::text`,
    label: Prisma.sql`u.full_name`,
    join: Prisma.sql`JOIN users u ON u.id = o.created_by`,
  },
  department: {
    key: Prisma.sql`o.department_id::text`,
    label: Prisma.sql`coalesce(d.name,'(chưa chốt)')`,
    join: Prisma.sql`LEFT JOIN departments d ON d.id = o.department_id`,
  },
  // Quy mô là một trục có thứ tự: xếp theo doanh thu sẽ đảo lộn các nhóm và không
  // ai đọc ra được xu hướng "đơn càng to giá trị trung bình càng cao".
  size: {
    key: sizeExpression('key'),
    label: sizeExpression('label'),
    join: Prisma.empty,
    order: Prisma.sql`key ASC`,
  },
};

/** Xem được hai chiều này là xem được xếp hạng doanh thu của người khác. */
const RESTRICTED_DIMENSIONS = ['department', 'sale'];

@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Cho phép ép HẸP hơn bằng ?departmentId / ?userId, nhưng không bao giờ rộng hơn
   * quyền: người ở tầng phòng không ép sang phòng khác được.
   */
  narrow(user: AuthenticatedUser, f: DashboardFilterDto): ReportScope {
    const s = this.scope.reportScope(user);
    if (f.departmentId !== undefined) {
      if (s.level === 'department' && s.departmentId !== f.departmentId)
        throw new ForbiddenException('Bạn chỉ xem được báo cáo phòng mình');
      if (s.level === 'personal') throw new ForbiddenException('Bạn không có báo cáo cấp phòng');
      return { level: 'department', departmentId: f.departmentId };
    }
    if (f.userId !== undefined) {
      if (s.level === 'personal' && s.createdBy !== f.userId && s.assigneeId !== f.userId)
        throw new ForbiddenException('Bạn chỉ xem được báo cáo của chính mình');
      return { level: 'personal', createdBy: f.userId, assigneeId: f.userId };
    }
    return s;
  }

  async summary(user: AuthenticatedUser, f: DashboardFilterDto): Promise<SummaryDto> {
    const s = this.narrow(user, f);
    const where = revenueFilter(s);

    const [row] = await this.prisma.$queryRaw<
      {
        rev_this: number; rev_prev: number; in_range: number;
        closed: number; decided: number; sla_late: number;
      }[]
    >`
      SELECT
        coalesce(sum(o.final_amount) FILTER (
          WHERE o.closed_at >= date_trunc('month', current_date)), 0)::float8 AS rev_this,
        coalesce(sum(o.final_amount) FILTER (
          WHERE o.closed_at >= date_trunc('month', current_date) - interval '1 month'
            AND o.closed_at <  date_trunc('month', current_date)), 0)::float8 AS rev_prev,
        count(*) FILTER (WHERE ${dateRange('o.created_at', f.fromDate, f.toDate)})::int AS in_range,
        count(*) FILTER (WHERE o.status = ANY(${REVENUE_STATUSES}::text[]))::int AS closed,
        -- "Da ra ket qua" = thang, hoac huy SAU khi da co bao gia. Trang thai
        -- 'rejected' khong con (migration 023) nen dem theo dau vet bao gia.
        count(*) FILTER (WHERE o.status = ANY(${REVENUE_STATUSES}::text[])
          OR (o.status = 'cancelled' AND EXISTS (
            SELECT 1 FROM order_departments od
             WHERE od.order_id = o.id AND od.amount IS NOT NULL)))::int AS decided,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM order_departments od JOIN services sv ON sv.id = o.service_id
          WHERE od.order_id = o.id AND od.state = 'pending'
            AND od.distributed_at < now() - (sv.sla_hours || ' hours')::interval))::int AS sla_late
      FROM orders o
      WHERE ${where}`;

    return {
      scopeLevel: s.level,
      revenueThisMonth: row.rev_this,
      revenuePrevMonth: row.rev_prev,
      ordersInRange: row.in_range,
      ordersClosed: row.closed,
      ordersDecided: row.decided,
      // null khi chưa có đơn nào ra kết quả — trả 0 sẽ bị đọc nhầm là "thua sạch".
      winRate: row.decided ? Math.round((row.closed / row.decided) * 1000) / 10 : null,
      slaLateCount: row.sla_late,
    };
  }

  async revenue(user: AuthenticatedUser, f: RevenueFilterDto): Promise<RevenuePointDto[]> {
    const s = this.narrow(user, f);
    const unit = TRUNC[f.groupBy ?? 'month']; // tham số ràng buộc, KHÔNG Prisma.raw
    // Prisma.raw sẽ chèn `month` như tên cột -> lỗi 42703 column "month" does not exist.
    const rows = await this.prisma.$queryRaw<
      { period: string; order_count: number; revenue: number; avg_value: number }[]
    >`
      SELECT to_char(date_trunc(${unit}::text, o.closed_at), 'YYYY-MM-DD') AS period,
             count(*)::int AS order_count,
             coalesce(sum(o.final_amount), 0)::float8 AS revenue,
             coalesce(round(avg(o.final_amount)), 0)::float8 AS avg_value
      FROM orders o
      WHERE ${revenueFilter(s)}
        AND o.status = ANY(${REVENUE_STATUSES}::text[])
        AND o.closed_at IS NOT NULL
        AND ${dateRange('o.closed_at', f.fromDate, f.toDate)}
      GROUP BY 1 ORDER BY 1`;

    const points: RevenuePointDto[] = rows.map((r) => ({
      // Định dạng NGAY trong SQL. Nếu để date_trunc trả timestamptz rồi
      // .toISOString() ở Node, mốc 01/08 giờ Việt Nam thành 2026-07-31T17:00Z
      // và nhãn cột lùi một ngày — tháng 8 hiện ra là 07/2026.
      period: r.period,
      orderCount: r.order_count,
      revenue: r.revenue,
      avgValue: r.avg_value,
    }));
    if (f.compare !== 'true') return points;

    const prev = await this.prisma.$queryRaw<{ period: string; revenue: number }[]>`
      SELECT to_char(date_trunc(${unit}::text, o.closed_at + interval '1 year'),
                     'YYYY-MM-DD') AS period,
             coalesce(sum(o.final_amount), 0)::float8 AS revenue
      FROM orders o
      WHERE ${revenueFilter(s)}
        AND o.status = ANY(${REVENUE_STATUSES}::text[])
        AND o.closed_at IS NOT NULL
      GROUP BY 1`;
    const map = new Map(prev.map((p) => [p.period, p.revenue]));
    return points.map((p) => ({ ...p, prevRevenue: map.get(p.period) ?? 0 }));
  }

  async revenueBy(
    user: AuthenticatedUser,
    f: RevenueByFilterDtoLike,
  ): Promise<RevenueByDto[]> {
    const s = this.narrow(user, f);
    // 'department' và 'sale' là bảng xếp hạng doanh thu của đồng nghiệp. Người ở
    // tầng phòng/cá nhân tuy chỉ tổng hợp trên dòng của mình, nhưng chiều này vẫn
    // để lộ cấu trúc doanh thu — chặn ở tuyến chứ không dựa vào phạm vi dòng.
    if (RESTRICTED_DIMENSIONS.includes(f.dimension) && s.level !== 'company')
      throw new ForbiddenException(
        `Chiều "${f.dimension}" chỉ dành cho người xem báo cáo toàn công ty`,
      );
    const dim = DIMENSIONS[f.dimension];
    const rows = await this.prisma.$queryRaw<
      { key: string; label: string; order_count: number; revenue: number; avg_value: number }[]
    >`
      SELECT ${dim.key} AS key, ${dim.label} AS label,
             count(*)::int AS order_count,
             coalesce(sum(o.final_amount), 0)::float8 AS revenue,
             coalesce(round(avg(o.final_amount)), 0)::float8 AS avg_value
      FROM orders o ${dim.join}
      WHERE ${revenueFilter(s)}
        AND o.status = ANY(${REVENUE_STATUSES}::text[])
        AND ${dateRange('o.closed_at', f.fromDate, f.toDate)}
      GROUP BY 1, 2
      ORDER BY ${dim.order ?? Prisma.sql`revenue DESC`}
      LIMIT 50`;
    return rows.map((r) => ({
      key: r.key ?? '',
      label: r.label ?? '',
      orderCount: r.order_count,
      revenue: r.revenue,
      avgValue: r.avg_value,
    }));
  }

  /** Đơn đang chạy — dùng cho phễu, không phụ thuộc closed_at. */
  openStatuses(): string[] {
    return [
      OrderStatus.NEW, OrderStatus.DISTRIBUTED, OrderStatus.QUOTING,
      OrderStatus.AWAITING_SELECTION,
    ];
  }
}

type RevenueByFilterDtoLike = DashboardFilterDto & {
  dimension: 'service' | 'route' | 'customer' | 'sale' | 'department' | 'size';
};
