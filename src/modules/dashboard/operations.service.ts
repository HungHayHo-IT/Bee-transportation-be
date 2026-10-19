import { Injectable } from '@nestjs/common';
import { OrderStatus, REVENUE_STATUSES } from '@/common/enums';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ReportScope } from '@/common/scope/scope.service';
import { statusLabel } from '../orders/order-state.helper';
import { dateRange, operationalFilter } from './dashboard-scope.helper';
import {
  AvgOrdersPerDeptDto, CompetitionDto, DashboardFilterDto, FunnelStepDto, ResponseTimeDto,
  StaffScoreDto, WinRateDto, WorkloadDto,
} from './dto/dashboard.dto';
import { tiLeChuyenDoi, xepHangTheoDiem } from './scorecard.helper';

// Phễu dựng theo danh sách này chứ không theo dữ liệu, nên trạng thái vắng mặt ở
// đây bị `.map` vứt đi lặng lẽ — admin đối chiếu phễu với danh sách đơn thấy hụt
// số mà không lần ra được phần chênh. awaiting_info đứng TRƯỚC 'new': đơn chưa đủ
// dữ liệu để vào hàng đợi.
const FUNNEL_ORDER = [
  OrderStatus.AWAITING_INFO,
  OrderStatus.NEW, OrderStatus.DISTRIBUTED, OrderStatus.QUOTING,
  OrderStatus.AWAITING_SELECTION, OrderStatus.CLOSED, OrderStatus.CANCELLED,
];

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async funnel(s: ReportScope, f: DashboardFilterDto): Promise<FunnelStepDto[]> {
    const rows = await this.prisma.$queryRaw<{ status: string; c: number }[]>`
      SELECT o.status, count(*)::int AS c
      FROM orders o
      WHERE ${operationalFilter(s)} AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
      GROUP BY 1`;
    const map = new Map(rows.map((r) => [r.status, r.c]));
    return FUNNEL_ORDER.map((st) => ({
      status: st,
      label: statusLabel(st),
      orderCount: map.get(st) ?? 0,
    }));
  }

  /**
   * Mẫu số = đơn ĐÃ RA TỚI BÀN ĐÀM PHÁN: thắng, cộng với đơn huỷ mà đã có ít
   * nhất một báo giá gửi đi.
   *
   * Trước migration 023, mẫu số là thắng + 'rejected'. Trạng thái đó đã gộp vào
   * 'cancelled', nên nếu cứ đếm theo trạng thái thì mẫu số bằng đúng tử số và
   * win rate luôn ra 100% — một con số vô nghĩa mà vẫn trông như đang chạy.
   *
   * Dấu hiệu thay thế là CÓ BÁO GIÁ hay chưa, và nó chặt hơn luật cũ: luật cũ
   * phụ thuộc vào việc người dùng bấm đúng nút "Khách từ chối" thay vì "Hủy đơn";
   * dấu hiệu mới đọc thẳng từ việc phòng ban đã gửi giá hay chưa. Đơn nhập nhầm,
   * khách rút nhu cầu trước khi ai kịp báo giá — vẫn nằm ngoài như trước.
   */
  async winRate(s: ReportScope, f: DashboardFilterDto): Promise<WinRateDto> {
    const [row] = await this.prisma.$queryRaw<{ won: number; rejected: number }[]>`
      SELECT count(*) FILTER (WHERE o.status = ANY(${REVENUE_STATUSES}::text[]))::int AS won,
             count(*) FILTER (WHERE o.status = 'cancelled')::int AS rejected
      FROM orders o
      WHERE ${operationalFilter(s)}
        AND (
          o.status = ANY(${REVENUE_STATUSES}::text[])
          OR (o.status = 'cancelled' AND EXISTS (
            SELECT 1 FROM order_departments od
             WHERE od.order_id = o.id AND od.amount IS NOT NULL))
        )
        AND ${dateRange('o.created_at', f.fromDate, f.toDate)}`;

    // Lý do đọc từ cancel_reason: reject() chép lý do khách từ chối sang đó, nên
    // một cột là đủ cho cả hai đường vào 'cancelled'.
    const reasons = await this.prisma.$queryRaw<{ reason: string; c: number }[]>`
      SELECT coalesce(nullif(btrim(o.cancel_reason), ''), '(không ghi)') AS reason,
             count(*)::int AS c
      FROM orders o
      WHERE ${operationalFilter(s)}
        AND o.status = 'cancelled'
        AND EXISTS (SELECT 1 FROM order_departments od
                     WHERE od.order_id = o.id AND od.amount IS NOT NULL)
        AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
      GROUP BY 1 ORDER BY c DESC`;

    const decided = row.won + row.rejected;
    return {
      won: row.won,
      rejected: row.rejected,
      decided,
      winRate: decided ? Math.round((row.won / decided) * 1000) / 10 : null,
      reasons: reasons.map((r) => ({ reason: r.reason, count: r.c })),
    };
  }

  /** distributed_at -> claimed_at / first_quoted_at. Dùng first_ chứ không last_. */
  async responseTime(s: ReportScope, f: DashboardFilterDto): Promise<ResponseTimeDto[]> {
    const rows = await this.prisma.$queryRaw<
      { id: number; name: string; h_claim: number | null; h_quote: number | null; late: number }[]
    >`
      SELECT d.id, d.name,
             round(avg(extract(epoch FROM od.claimed_at - od.distributed_at) / 3600)::numeric, 1)::float8
               AS h_claim,
             round(avg(extract(epoch FROM od.first_quoted_at - od.distributed_at) / 3600)::numeric, 1)::float8
               AS h_quote,
             count(*) FILTER (
               WHERE od.state = 'pending'
                 AND od.distributed_at < now() - (sv.sla_hours || ' hours')::interval)::int AS late
      FROM order_departments od
      JOIN departments d ON d.id = od.department_id
      JOIN orders o      ON o.id = od.order_id
      JOIN services sv   ON sv.id = o.service_id
      WHERE ${operationalFilter(s)} AND ${dateRange('od.distributed_at', f.fromDate, f.toDate)}
      GROUP BY d.id, d.name
      ORDER BY d.name`;
    return rows.map((r) => ({
      departmentId: r.id,
      departmentName: r.name,
      hoursToClaim: r.h_claim,
      hoursToFirstQuote: r.h_quote,
      lateCount: r.late,
    }));
  }

  /** Tỷ lệ thắng báo giá theo phòng — mẫu số là đơn phòng ĐÃ THAM GIA (won + lost). */
  async competition(s: ReportScope, f: DashboardFilterDto): Promise<CompetitionDto[]> {
    const rows = await this.prisma.$queryRaw<
      { id: number; name: string; participated: number; won: number; passed: number }[]
    >`
      SELECT d.id, d.name,
             count(*) FILTER (WHERE od.state IN ('won','lost'))::int AS participated,
             count(*) FILTER (WHERE od.state = 'won')::int  AS won,
             count(*) FILTER (WHERE od.state = 'passed')::int AS passed
      FROM order_departments od
      JOIN departments d ON d.id = od.department_id
      JOIN orders o      ON o.id = od.order_id
      WHERE ${operationalFilter(s)} AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
      GROUP BY d.id, d.name
      ORDER BY d.name`;
    return rows.map((r) => ({
      departmentId: r.id,
      departmentName: r.name,
      participated: r.participated,
      won: r.won,
      passed: r.passed,
      quoteWinRate: r.participated
        ? Math.round((r.won / r.participated) * 1000) / 10
        : null,
    }));
  }

  async avgDepartmentsPerOrder(
    s: ReportScope,
    f: DashboardFilterDto,
  ): Promise<AvgOrdersPerDeptDto> {
    const [row] = await this.prisma.$queryRaw<{ avg: number | null }[]>`
      SELECT round(avg(n), 2)::float8 AS avg FROM (
        SELECT count(*)::int AS n
        FROM order_departments od
        JOIN orders o ON o.id = od.order_id
        WHERE ${operationalFilter(s)} AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
        GROUP BY od.order_id
      ) t`;
    return { avgDepartmentsPerOrder: row.avg ?? 0 };
  }

  async workloadByDepartment(s: ReportScope, f: DashboardFilterDto): Promise<WorkloadDto[]> {
    const rows = await this.prisma.$queryRaw<
      { id: number; name: string; total: number; open: number }[]
    >`
      SELECT d.id, d.name, count(*)::int AS total,
             count(*) FILTER (WHERE od.state IN ('pending','claimed','quoted'))::int AS open
      FROM order_departments od
      JOIN departments d ON d.id = od.department_id
      JOIN orders o      ON o.id = od.order_id
      WHERE ${operationalFilter(s)} AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
      GROUP BY d.id, d.name ORDER BY total DESC`;
    return rows.map((r) => ({ id: r.id, name: r.name, orderCount: r.total, openCount: r.open }));
  }

  /**
   * Bảng đánh giá người TẠO đơn — admin sale.
   *
   * Bốn con số một người: đơn tạo, tổng tiền đã báo cho khách, đơn chốt,
   * doanh thu. Tỷ lệ chuyển đổi tính trên đơn ĐÃ RA KẾT QUẢ, không trên tổng
   * đơn tạo: đơn vừa tạo hôm qua còn đang chạy, đếm nó vào mẫu số là kéo tỷ
   * lệ của mọi người xuống theo đúng tốc độ họ nhận việc mới.
   *
   * `quotedTotal` là tổng giá đã gửi khách, KHÁC doanh thu — chênh lệch giữa
   * hai cột này chính là phần đã báo mà không chốt được.
   */
  async scorecardBySale(s: ReportScope, f: DashboardFilterDto): Promise<StaffScoreDto[]> {
    const rows = await this.prisma.$queryRaw<
      { id: number; name: string; orders: number; decided: number; closed: number;
        quoted: number; revenue: number }[]
    >`
      SELECT u.id, u.full_name AS name,
             count(*)::int AS orders,
             count(*) FILTER (WHERE o.status = ANY(${REVENUE_STATUSES}::text[])
               OR (o.status = 'cancelled' AND EXISTS (
                 SELECT 1 FROM order_departments od
                  WHERE od.order_id = o.id AND od.amount IS NOT NULL)))::int AS decided,
             count(*) FILTER (WHERE o.status = ANY(${REVENUE_STATUSES}::text[]))::int AS closed,
             coalesce(sum((SELECT min(od.amount) FROM order_departments od
                            WHERE od.order_id = o.id AND od.amount IS NOT NULL)), 0)::bigint AS quoted,
             coalesce(sum(o.final_amount) FILTER (
               WHERE o.status = ANY(${REVENUE_STATUSES}::text[])), 0)::bigint AS revenue
      FROM orders o
      JOIN users u ON u.id = o.created_by
      WHERE ${operationalFilter(s)} AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
      GROUP BY u.id, u.full_name`;

    return xepHangTheoDiem(
      rows.map((r) => ({
        userId: r.id,
        fullName: r.name,
        orderCount: r.orders,
        decidedCount: r.decided,
        closedCount: r.closed,
        quotedTotal: Number(r.quoted),
        revenue: Number(r.revenue),
      })),
    ).map((r) => ({ ...r, conversionRate: tiLeChuyenDoi(r.closedCount, r.decidedCount) }));
  }

  /**
   * Bảng đánh giá người NHẬP GIÁ — pricing.
   *
   * Đếm trên order_departments chứ không trên orders: một đơn đi tới nhiều
   * phòng, và việc của người nhập giá là DÒNG BÁO GIÁ của họ, không phải cả
   * đơn. Mẫu số là số báo giá đã gửi; tử số là số báo giá thắng.
   */
  async scorecardByPricing(s: ReportScope, f: DashboardFilterDto): Promise<StaffScoreDto[]> {
    const rows = await this.prisma.$queryRaw<
      { id: number; name: string; orders: number; decided: number; closed: number;
        quoted: number; revenue: number }[]
    >`
      SELECT u.id, u.full_name AS name,
             count(*)::int AS orders,
             count(*) FILTER (WHERE od.amount IS NOT NULL)::int AS decided,
             count(*) FILTER (WHERE od.state = 'won')::int AS closed,
             coalesce(sum(od.amount), 0)::bigint AS quoted,
             coalesce(sum(od.amount) FILTER (WHERE od.state = 'won'), 0)::bigint AS revenue
      FROM order_departments od
      JOIN users u  ON u.id = od.assignee_id
      JOIN orders o ON o.id = od.order_id
      WHERE ${operationalFilter(s)} AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
      GROUP BY u.id, u.full_name`;

    return xepHangTheoDiem(
      rows.map((r) => ({
        userId: r.id,
        fullName: r.name,
        orderCount: r.orders,
        decidedCount: r.decided,
        closedCount: r.closed,
        quotedTotal: Number(r.quoted),
        revenue: Number(r.revenue),
      })),
    ).map((r) => ({ ...r, conversionRate: tiLeChuyenDoi(r.closedCount, r.decidedCount) }));
  }

  async workloadByUser(s: ReportScope, f: DashboardFilterDto): Promise<WorkloadDto[]> {
    const rows = await this.prisma.$queryRaw<
      { id: number; name: string; total: number; open: number }[]
    >`
      SELECT u.id, u.full_name AS name, count(*)::int AS total,
             count(*) FILTER (WHERE od.state IN ('claimed','quoted'))::int AS open
      FROM order_departments od
      JOIN users u  ON u.id = od.assignee_id
      JOIN orders o ON o.id = od.order_id
      WHERE ${operationalFilter(s)} AND ${dateRange('o.created_at', f.fromDate, f.toDate)}
      GROUP BY u.id, u.full_name ORDER BY total DESC`;
    return rows.map((r) => ({ id: r.id, name: r.name, orderCount: r.total, openCount: r.open }));
  }
}
