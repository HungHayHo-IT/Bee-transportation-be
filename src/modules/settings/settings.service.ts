import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { THAM_SO, thamSoCua } from './cau-hinh';

export interface ThamSoDto {
  key: string;
  label: string;
  moTa: string;
  value: number;
  min: number;
  max: number;
  macDinh: number;
}

/** Tham số hệ thống sửa được từ màn Cấu hình — xem cau-hinh.ts. */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async doc(): Promise<ThamSoDto[]> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: THAM_SO.map((t) => t.key) } },
      select: { key: true, value: true },
    });
    const theoKhoa = new Map(rows.map((r) => [r.key, r.value]));
    return THAM_SO.map((t) => {
      const so = Number(theoKhoa.get(t.key));
      /* Chưa có dòng, hoặc giá trị hỏng -> hiện MẶC ĐỊNH. Hiện số hỏng ra ô
         nhập thì người sửa tưởng đó là giá trị đang chạy, trong khi mã nguồn
         đã âm thầm rơi về mặc định. */
      return {
        key: t.key,
        label: t.label,
        moTa: t.moTa,
        value: Number.isFinite(so) && so > 0 ? Math.floor(so) : t.macDinh,
        min: t.min,
        max: t.max,
        macDinh: t.macDinh,
      };
    });
  }

  async ghi(key: string, value: number, user: AuthenticatedUser): Promise<ThamSoDto[]> {
    const t = thamSoCua(key);
    // Khoá ngoài danh sách cho phép: từ chối. app_settings còn giữ nội dung
    // điều khoản ký và những thứ khác do mã nguồn ghi.
    if (!t) throw new BadRequestException(`Không có tham số "${key}"`);
    if (!Number.isInteger(value) || value < t.min || value > t.max)
      throw new BadRequestException(`"${t.label}" phải là số nguyên từ ${t.min} đến ${t.max}`);

    await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: String(value), updatedBy: user.id },
      update: { value: String(value), updatedBy: user.id, updatedAt: new Date() },
    });
    return this.doc();
  }
}
