import { Prisma } from '@prisma/client';
import { ReportScope } from '@/common/scope/scope.service';

/**
 * Hai nhóm chỉ số dùng HAI mệnh đề khác nhau — đừng dùng chung một hàm:
 *
 * - Doanh thu: chỉ đơn phòng THẮNG. Doanh thu thuộc về phòng thực hiện.
 * - Vận hành:  cả đơn phòng chỉ THAM GIA báo giá rồi thua. Nếu bỏ, tỷ lệ thắng báo
 *              giá mất đúng phần mẫu số cần để tính.
 *
 * Các vế luôn OR với nhau, giống hệt ScopeService.orderWhere — lệch nhau là dashboard
 * và danh sách đơn đá nhau.
 */

const TRUE = Prisma.sql`TRUE`;
const FALSE = Prisma.sql`FALSE`;

function combine(parts: Prisma.Sql[]): Prisma.Sql {
  if (!parts.length) return FALSE; // an toàn mặc định, không phải TRUE
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

/** Mệnh đề cho chỉ số DOANH THU — phòng thắng. */
export function revenueFilter(s: ReportScope): Prisma.Sql {
  if (s.level === 'company') return TRUE;
  const parts: Prisma.Sql[] = [];
  if (s.departmentId) parts.push(Prisma.sql`o.department_id = ${s.departmentId}`);
  if (s.createdBy) parts.push(Prisma.sql`o.created_by = ${s.createdBy}`);
  if (s.assigneeId)
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM order_departments od
      WHERE od.order_id = o.id AND od.assignee_id = ${s.assigneeId} AND od.state = 'won')`);
  return combine(parts);
}

/** Mệnh đề cho chỉ số VẬN HÀNH — mọi phòng có tham gia. */
export function operationalFilter(s: ReportScope): Prisma.Sql {
  if (s.level === 'company') return TRUE;
  const parts: Prisma.Sql[] = [];
  if (s.departmentId)
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM order_departments od
      WHERE od.order_id = o.id AND od.department_id = ${s.departmentId})`);
  if (s.createdBy) parts.push(Prisma.sql`o.created_by = ${s.createdBy}`);
  if (s.assigneeId)
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM order_departments od
      WHERE od.order_id = o.id AND od.assignee_id = ${s.assigneeId})`);
  return combine(parts);
}

/** Khoảng thời gian. Doanh thu luôn tính theo closed_at, KHÔNG phải created_at. */
export function dateRange(column: string, from?: string, to?: string): Prisma.Sql {
  const col = Prisma.raw(column);
  const parts: Prisma.Sql[] = [];
  if (from) parts.push(Prisma.sql`${col} >= ${from}::date`);
  if (to) parts.push(Prisma.sql`${col} < (${to}::date + 1)`);
  if (!parts.length) return TRUE;
  return Prisma.sql`(${Prisma.join(parts, ' AND ')})`;
}

export const TRUNC: Record<string, string> = { day: 'day', month: 'month', quarter: 'quarter' };
