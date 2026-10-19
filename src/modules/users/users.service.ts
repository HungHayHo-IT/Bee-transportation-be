import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { ActivityService } from '@/common/activity/activity.service';
import { PageResult } from '@/common/dto/pagination.dto';
import { PrismaService } from '@/common/prisma/prisma.service';
import { isCompanyWide } from '@/common/scope/is-company-wide';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { resolveCreateScope } from './create-scope.helper';
import { canXoaDuoc } from './xoa-tai-khoan.helper';
import { CreateUserDto, SetStatusDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';

const USER_INCLUDE = { department: { select: { name: true } } };

type UserRow = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

export interface UserFilter {
  departmentId?: number;
  role?: string;
  isActive?: boolean;
  q?: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Map tường minh — KHÔNG trải bản ghi Prisma, tránh lộ passwordHash. */
  private toDto(u: UserRow): UserResponseDto {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      departmentId: u.departmentId,
      departmentName: u.department?.name ?? null,
      roles: u.roles,
      canViewCompanyReport: u.canViewCompanyReport,
      canViewAllOrders: u.canViewAllOrders,
      mustChangePassword: u.mustChangePassword,
      isActive: u.isActive,
    };
  }

  /** Sinh PIN 6 chữ số (dùng khi Admin tạo user hoặc reset). */
  private genPassword(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async list(
    f: UserFilter,
    caller: AuthenticatedUser,
    page = 1,
    limit = 50,
  ): Promise<PageResult<UserResponseDto>> {
    const where: Prisma.UserWhereInput = {};
    if (f.departmentId !== undefined) where.departmentId = f.departmentId;

    // Trưởng phòng chỉ được thấy người của phòng mình. Ép ở đây chứ không tin
    // tham số: giao điểm với departmentId người gọi truyền vào, nên hỏi phòng khác
    // ra rỗng thay vì lộ danh sách.
    const empty: PageResult<UserResponseDto> = { items: [], total: 0, page, limit };
    if (!isCompanyWide(caller)) {
      if (caller.departmentId === null) return empty;
      if (f.departmentId !== undefined && f.departmentId !== caller.departmentId) return empty;
      where.departmentId = caller.departmentId;
    }

    if (f.isActive !== undefined) where.isActive = f.isActive;
    if (f.role) where.roles = { has: f.role };
    if (f.q)
      where.OR = [
        { fullName: { contains: f.q, mode: 'insensitive' } },
        { email: { contains: f.q, mode: 'insensitive' } },
      ];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: USER_INCLUDE,
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.toDto(r)), total, page, limit };
  }

  async detail(id: number): Promise<UserResponseDto> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
    if (!u) throw new NotFoundException('Không tìm thấy nhân viên');
    return this.toDto(u);
  }

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponseDto & { tempPassword: string }> {
    // Admin cấp gì cũng được; trưởng phòng chỉ cấp Nhân viên/Sale cho đúng phòng
    // mình — xem create-scope.helper để biết vì sao đúng ba lằn ranh đó.
    const scope = resolveCreateScope(actor, dto);

    if (await this.prisma.user.findUnique({ where: { email: dto.email } }))
      throw new ConflictException('Email này đã được dùng');
    if (scope.departmentId && !(await this.prisma.department.count({ where: { id: scope.departmentId } })))
      throw new BadRequestException('Phòng ban không tồn tại');

    const tempPassword = dto.tempPassword ?? this.genPassword();
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        phone: dto.phone,
        departmentId: scope.departmentId,
        roles: scope.roles,
        passwordHash: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
        mustChangePassword: true,
      },
      include: USER_INCLUDE,
    });
    await this.activity.log(null, {
      entity: 'users', entityId: created.id, action: 'create', actorId: actor.id,
      detail: { roles: dto.roles },
    });
    return { ...this.toDto(created), tempPassword };
  }

  async update(id: number, dto: UpdateUserDto, actor: AuthenticatedUser): Promise<UserResponseDto> {
    await this.detail(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      include: USER_INCLUDE,
    });
    await this.activity.log(null, {
      entity: 'users', entityId: id, action: 'update', actorId: actor.id, detail: { ...dto },
    });
    return this.toDto(updated);
  }

  /** Khóa tài khoản. Có hiệu lực NGAY vì JwtStrategy đọc is_active mỗi request. */
  async setStatus(
    id: number,
    dto: SetStatusDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    if (id === actor.id && !dto.isActive)
      throw new BadRequestException('Không thể tự khóa tài khoản của chính mình');
    await this.detail(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: dto.isActive },
      include: USER_INCLUDE,
    });
    await this.activity.log(null, {
      entity: 'users', entityId: id, action: dto.isActive ? 'unlock' : 'lock', actorId: actor.id,
    });
    return this.toDto(updated);
  }

  async resetPassword(id: number, actor: AuthenticatedUser): Promise<{ tempPassword: string }> {
    await this.detail(id);
    const tempPassword = this.genPassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
        mustChangePassword: true,
      },
    });
    await this.activity.log(null, {
      entity: 'users', entityId: id, action: 'reset_password', actorId: actor.id,
    });
    return { tempPassword };
  }

  /**
   * Xoá THẬT một tài khoản nhân viên, kèm mọi thứ trỏ vào nó.
   *
   * Tám bảng trỏ vào users(id) mà KHÔNG khai ON DELETE, nên Postgres chặn;
   * phải dọn tay từng bảng trong CÙNG MỘT transaction. Dọn ngoài transaction
   * là hỏng giữa chừng để lại một tài khoản mất nửa dữ liệu mà vẫn đăng nhập
   * được.
   *
   * Ba cách xử lý, và sự khác nhau là có chủ ý:
   *   xoá      nhật ký, bình luận — dấu vết của người đã rời đi
   *   bỏ trống người phụ trách, người tick mốc, người sửa cấu hình
   *   CHUYỂN   đơn hàng và phiếu ký
   *
   * Phiếu ký KHÔNG xoá dù cột cho phép: đó là chứng cứ của hợp đồng khách đã
   * ký, xoá nó là xoá bằng chứng. Đơn hàng thì cột created_by là NOT NULL nên
   * cũng không bỏ trống được. Cả hai đổi sang người nhận lại.
   */
  async xoa(id: number, idNhanLaiDon: number | undefined, actor: AuthenticatedUser): Promise<void> {
    const u = await this.detail(id);
    const phaiChuyen = {
      don: await this.prisma.order.count({ where: { createdBy: id } }),
      phieuKy: await this.prisma.orderSignature.count({ where: { createdBy: id } }),
    };
    const loi = canXoaDuoc({
      vaiCuaNguoiBiXoa: u.roles,
      idNguoiBiXoa: id,
      idNguoiXoa: actor.id,
      phaiChuyen,
      idNhanLaiDon,
    });
    if (loi) throw new ConflictException(loi);

    // Người nhận lại phải có thật và đang bật — chuyển sang một tài khoản đã
    // khoá là giấu đống đơn đó khỏi mọi màn hình lọc theo người đang làm việc.
    if (idNhanLaiDon !== undefined) {
      const nhan = await this.prisma.user.findFirst({
        where: { id: idNhanLaiDon, isActive: true },
      });
      if (!nhan) throw new ConflictException('Người nhận lại không tồn tại hoặc đã bị khoá');
    }

    await this.prisma.$transaction(async (tx) => {
      const sang = { createdBy: idNhanLaiDon as number };
      if (phaiChuyen.don > 0) await tx.order.updateMany({ where: { createdBy: id }, data: sang });
      if (phaiChuyen.phieuKy > 0)
        await tx.orderSignature.updateMany({ where: { createdBy: id }, data: sang });

      await tx.orderDepartment.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
      await tx.orderMilestone.updateMany({ where: { doneBy: id }, data: { doneBy: null } });
      await tx.rolePagePermission.updateMany({ where: { updatedBy: id }, data: { updatedBy: null } });
      await tx.appSetting.updateMany({ where: { updatedBy: id }, data: { updatedBy: null } });
      await tx.department.updateMany({ where: { managerId: id }, data: { managerId: null } });

      await tx.comment.deleteMany({ where: { userId: id } });
      await tx.activityLog.deleteMany({ where: { actorId: id } });

      await tx.user.delete({ where: { id } });
    });

    /* Ghi nhật ký SAU transaction: ghi bên trong thì chính dòng này bị
       deleteMany ở trên xoá mất, và việc xoá một tài khoản không để lại dấu
       vết nào. */
    await this.activity.log(null, {
      entity: 'users',
      entityId: id,
      action: 'delete',
      actorId: actor.id,
      detail: { email: u.email, fullName: u.fullName, ...phaiChuyen, idNhanLaiDon },
    });
  }
}
