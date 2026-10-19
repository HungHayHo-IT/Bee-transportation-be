import { User } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';

/** Bóc User của Prisma về đúng hình dạng AuthenticatedUser mà OrdersService cần. */
function toActor(u: User): AuthenticatedUser {
  return {
    id: u.id, email: u.email, fullName: u.fullName, roles: u.roles,
    departmentId: u.departmentId, canViewCompanyReport: u.canViewCompanyReport,
    mustChangePassword: u.mustChangePassword,
  };
}

/**
 * Ai đứng tên Order sinh ra từ form công khai. Nếu người submit đang đăng nhập
 * là Sale thì dùng chính họ — đơn "về tay" người đã tiếp khách. Không thì
 * `null`: đơn do KHÁCH tự tạo, chưa Sale nào phụ trách cho tới khi có người
 * bấm "Nhận đơn" (075, 13/10/2026 — bỏ tài khoản hệ thống public@bee.internal).
 *
 * Tách khỏi service vì file đó đã sát mốc 300 dòng của repo.
 */
export async function resolveOrderActor(
  prisma: PrismaService, sessionUserId: number | null,
): Promise<AuthenticatedUser | null> {
  if (sessionUserId === null) return null;
  const u = await prisma.user.findUnique({ where: { id: sessionUserId } });
  // Chỉ Sale mới nên đứng tên đơn (Admin/Manager submit hộ khách coi như khách).
  return u?.isActive && u.roles.includes('sale') ? toActor(u) : null;
}
