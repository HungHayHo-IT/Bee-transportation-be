import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Trang } from '@/common/permissions/page.decorator';
import { ActivityService } from '@/common/activity/activity.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { ALL_ROLES } from '@/common/enums';
import {
  KHOA_TRANG, MUC_QUYEN_HOP_LE, TRANG_PHAN_QUYEN, TRANG_QUYEN,
} from '@/common/permissions/pages';
import { PermissionMatrixService } from '@/common/permissions/permission-matrix.service';

class ODatDto {
  @ApiProperty() @IsString() @IsIn(ALL_ROLES)
  role!: string;

  @ApiProperty() @IsString() @IsIn(KHOA_TRANG as string[])
  pageKey!: string;

  @ApiProperty({ enum: MUC_QUYEN_HOP_LE }) @IsString() @IsIn(MUC_QUYEN_HOP_LE as string[])
  level!: string;
}

class LuuMaTranDto {
  /**
   * Giới hạn số ô một lần gửi: ma trận đầy đủ là 23 trang x 5 vai trò = 115 ô,
   * nên 300 là rộng rãi mà vẫn chặn một request cố tình dài.
   */
  @ApiProperty({ type: [ODatDto] })
  @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => ODatDto)
  cells!: ODatDto[];
}

class MaTranDto {
  @ApiProperty({ description: 'Các trang, theo đúng thứ tự menu' })
  pages!: { key: string; group: string; scope: string }[];
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: [ODatDto] }) cells!: ODatDto[];
  @ApiProperty({ description: 'Trang không được bỏ quyền của Quản trị viên' })
  lockedPage!: string;
}

/**
 * Ma trận phân quyền theo trang.
 *
 * Chính endpoint này cũng đi qua ma trận (`@Trang('permissions')`), nên "ai
 * sửa được phân quyền" cũng là một ô trong bảng — trừ Quản trị viên, vai trò
 * duy nhất không bao giờ mất quyền ở đây.
 */
@ApiTags('Phân quyền')
@Controller('permissions')
@Trang(TRANG_PHAN_QUYEN)
export class PermissionsController {
  constructor(
    private readonly matrix: PermissionMatrixService,
    private readonly activity: ActivityService,
  ) {}

  /**
   * Mức quyền của CHÍNH người đang đăng nhập, theo từng trang.
   *
   * Không gắn `@Trang` cho riêng handler này — nó phải mở cho mọi tài khoản,
   * kể cả người không có quyền vào màn phân quyền: đây là thứ menu bên quản
   * trị dùng để biết nên hiện những mục nào. Giấu nó đi thì menu lại phải đoán
   * bằng một bảng cứng, tức là quay về đúng chỗ cũ.
   */
  @Get('me')
  // @Trang() không tham số = KHÔNG thuộc trang nào, mở cho mọi tài khoản đã
  // đăng nhập. Khai @Trang('') là khai một trang tên rỗng — tra ra "không có
  // quyền" và chặn đúng cái endpoint mà menu dựa vào để biết hiện gì.
  @Trang()
  @ApiOperation({ summary: 'Mức quyền của tôi trên từng trang' })
  async cuaToi(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ levels: Record<string, string> }> {
    const levels: Record<string, string> = {};
    for (const t of TRANG_QUYEN) {
      levels[t.key] = await this.matrix.mucCua(user.roles, t.key);
    }
    return { levels };
  }

  @Get('matrix')
  @ApiOperation({ summary: 'Ma trận phân quyền theo trang' })
  @ApiResponse({ status: 200, type: MaTranDto })
  async matran(): Promise<MaTranDto> {
    return {
      pages: TRANG_QUYEN.map((t) => ({ key: t.key, group: t.nhom, scope: t.phamVi })),
      roles: [...ALL_ROLES],
      cells: await this.matrix.toanBo(),
      lockedPage: TRANG_PHAN_QUYEN,
    };
  }

  @Post('matrix/reset')
  @ApiOperation({
    summary: 'Đặt lại toàn bộ ma trận về bản mặc định',
    description:
      'Ghi đè MỌI ô, kể cả ô chưa ai đụng tới — "đặt lại" mà chỉ đụng phần đã sửa thì kết ' +
      'quả phụ thuộc vào lịch sử sửa của từng hệ thống.',
  })
  async datLai(@CurrentUser() user: AuthenticatedUser): Promise<{ saved: number }> {
    const saved = await this.matrix.datLaiMacDinh(user.id);
    await this.activity.log(null, {
      entity: 'role_page_permissions',
      entityId: 0,
      action: 'update',
      actorId: user.id,
      detail: { reset: true, cells: saved },
    });
    return { saved };
  }

  @Put('matrix')
  @ApiOperation({
    summary: 'Lưu ma trận phân quyền',
    description:
      'Chỉ gửi những ô đã đổi. Có hiệu lực ngay, không cần deploy lại. Một ô sai thì ' +
      'từ chối CẢ MẺ — lưu nửa vời là ma trận trên màn và ma trận thật khác nhau.',
  })
  async luu(
    @Body() dto: LuuMaTranDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ saved: number }> {
    const saved = await this.matrix.luu(
      dto.cells.map((c) => ({ role: c.role, pageKey: c.pageKey, level: c.level as never })),
      user.id,
    );
    // Ghi nhật ký: đổi quyền là thứ phải trả lời được "ai đổi, lúc nào" sau
    // vài tháng, và không có bản ghi nào khác nói điều đó.
    await this.activity.log(null, {
      entity: 'role_page_permissions',
      entityId: 0,
      action: 'update',
      actorId: user.id,
      detail: { cells: dto.cells.map((c) => ({ ...c })) },
    });
    return { saved };
  }
}
