import { Injectable, NotFoundException } from '@nestjs/common';
import {
  LandingRefreshService, THE_NGUOI_DAI_DIEN,
} from '@/common/landing/landing-refresh.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { Role } from '@/common/enums';
import {
  DepartmentRepresentativeGroupDto, LandingRepresentativeDto,
  RepresentativeUserDto,
} from './dto/sale.dto';
import { oChuoiGhiDe } from './representative.helper';

// Vai tro cang cao thi so cang nho -> sap xep giam dan (asc).
const ROLE_RANK: Record<string, number> = {
  [Role.ADMIN]: 1, [Role.LEADER]: 2, [Role.MANAGER]: 3, [Role.SALE]: 4, [Role.STAFF]: 5,
};

function topRoleRank(roles: string[]): number {
  return roles.reduce((best, r) => Math.min(best, ROLE_RANK[r] ?? 99), 99);
}

const USER_INCLUDE = { department: { select: { id: true, name: true } } };

@Injectable()
export class SaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly landing: LandingRefreshService,
  ) {}

  private toUserDto(u: {
    id: number; fullName: string; email: string; phone: string | null;
    roles: string[]; isLandingRepresentative: boolean; landingDescription: string | null;
    landingAvatarUrl: string | null;
  }): RepresentativeUserDto {
    return {
      id: u.id, fullName: u.fullName, email: u.email, phone: u.phone,
      roles: u.roles, isLandingRepresentative: u.isLandingRepresentative,
      landingDescription: u.landingDescription,
      landingAvatarUrl: u.landingAvatarUrl,
    };
  }

  /**
   * Danh sach nhan vien nhom theo phong ban, moi phong sap xep theo role tu
   * cao xuong thap roi den fullName. Nhan vien khong co phong xep vao cuoi.
   */
  async listGrouped(): Promise<DepartmentRepresentativeGroupDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true },
      include: USER_INCLUDE,
      orderBy: [{ fullName: 'asc' }],
    });

    const byDept = new Map<number | null, DepartmentRepresentativeGroupDto>();
    for (const u of rows) {
      const key = u.departmentId ?? null;
      let group = byDept.get(key);
      if (!group) {
        group = {
          departmentId: key,
          departmentName: u.department?.name ?? 'Chưa có phòng ban',
          users: [],
        };
        byDept.set(key, group);
      }
      group.users.push(this.toUserDto(u));
    }

    const groups = [...byDept.values()];
    for (const g of groups) g.users.sort((a, b) => {
      const rank = topRoleRank(a.roles) - topRoleRank(b.roles);
      return rank !== 0 ? rank : a.fullName.localeCompare(b.fullName, 'vi');
    });
    // Phong co ten -> a-z, khong phong -> cuoi.
    groups.sort((a, b) => {
      if (a.departmentId === null) return 1;
      if (b.departmentId === null) return -1;
      return a.departmentName.localeCompare(b.departmentName, 'vi');
    });
    return groups;
  }

  /**
   * Bật/tắt hiển thị, và/hoặc sửa mô tả.
   *
   * Trường nào không gửi thì GIỮ NGUYÊN — gửi mô tả mà vô tình tắt luôn người
   * đó khỏi landing là kiểu hỏng không ai ngờ. Chuỗi rỗng thì lưu NULL: rỗng
   * và "chưa viết" là một chuyện, giữ hai cách biểu diễn là bắt mọi chỗ đọc
   * phải kiểm hai lần.
   */
  async toggle(
    userId: number,
    flag: boolean | undefined,
    moTa: string | undefined,
    anh: string | undefined,
  ): Promise<RepresentativeUserDto> {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) throw new NotFoundException('Không tìm thấy nhân viên');
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(flag === undefined ? {} : { isLandingRepresentative: flag }),
        ...(oChuoiGhiDe(moTa) === undefined ? {} : { landingDescription: oChuoiGhiDe(moTa) }),
        ...(oChuoiGhiDe(anh) === undefined ? {} : { landingAvatarUrl: oChuoiGhiDe(anh) }),
      },
    });
    // Bao landing lam moi NGAY. Khong co dong nay thi bat mot nguoi len trang
    // xong phai ngoi doi het cua so 60 giay moi thay — va trong luc cho, khong
    // ai phan biet duoc "bat hut" voi "chua toi luot lam moi".
    await this.landing.lamMoi(THE_NGUOI_DAI_DIEN);
    return this.toUserDto(u);
  }

  /** Danh sach cho trang landing PUBLIC — khong bao gio tra password_hash. */
  async landingList(): Promise<LandingRepresentativeDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, isLandingRepresentative: true },
      include: USER_INCLUDE,
      orderBy: [{ fullName: 'asc' }],
    });
    return rows.map((u) => ({
      id: u.id, fullName: u.fullName, email: u.email, phone: u.phone,
      departmentName: u.department?.name ?? null, roles: u.roles,
      description: u.landingDescription,
      avatarUrl: u.landingAvatarUrl,
    }));
  }

  /**
   * Chi tiet mot nguoi dai dien cho trang landing PUBLIC. Chi tra ve khi user
   * dang bat va con active — tranh lo thong tin nhan vien khong duoc chon.
   * User bi tat / bi khoa deu tra 404 giong nhau, khong phan biet vi ly do gi.
   */
  async landingDetail(userId: number): Promise<LandingRepresentativeDto> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, isLandingRepresentative: true },
      include: USER_INCLUDE,
    });
    if (!u) throw new NotFoundException('Không tìm thấy người đại diện');
    return {
      id: u.id, fullName: u.fullName, email: u.email, phone: u.phone,
      departmentName: u.department?.name ?? null, roles: u.roles,
      description: u.landingDescription,
      avatarUrl: u.landingAvatarUrl,
    };
  }
}
