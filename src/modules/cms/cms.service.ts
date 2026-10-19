import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActivityService } from '@/common/activity/activity.service';
import {
  LandingRefreshService, THE_NOI_DUNG,
} from '@/common/landing/landing-refresh.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { assertKeyPath } from './content-key.helper';
import { localesFor } from './content-locale.helper';
import { CmsLocale, ContentValueDto, SaveContentDto } from './dto/cms.dto';

@Injectable()
export class CmsService {
  private readonly logger = new Logger(CmsService.name);
  /** Danh mục ô, nhớ tạm theo ngôn ngữ. Xem schema(). */
  private readonly nhoTam = new Map<CmsLocale, { luc: number; data: unknown }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly config: ConfigService,
    private readonly landing: LandingRefreshService,
  ) {}

  /**
   * Danh mục ô nội dung, lấy hộ từ landing.
   *
   * Vì sao backend đi lấy thay vì để admin gọi thẳng landing: admin chỉ nói
   * chuyện với BeeOps, nên không phải mở CORS trên landing, không phải thêm
   * một địa chỉ nữa vào cấu hình của admin, và trang CMS không chết khi ai đó
   * đổi tên miền landing mà quên báo.
   *
   * Nhớ tạm 60 giây: danh mục chỉ đổi khi landing được deploy lại, mà trang
   * CMS thì mở ra đóng vào liên tục.
   */
  /**
   * Quên bản danh mục đang nhớ tạm.
   *
   * Thêm một dịch vụ là danh mục ô ĐỔI NGAY — trang mới có ba mươi ô cần điền.
   * Không quên bản cũ thì người vừa thêm phải ngồi đợi hết 60 giây mới thấy
   * trang của mình, đúng lúc họ đang chờ để viết.
   */
  quenDanhMuc(): void {
    this.nhoTam.clear();
  }

  async schema(locale: CmsLocale): Promise<unknown> {
    const cu = this.nhoTam.get(locale);
    if (cu && Date.now() - cu.luc < 60_000) return cu.data;

    const goc = (this.config.get<string>('LANDING_URL') ?? '').replace(/\/+$/, '');
    if (!goc)
      throw new ServiceUnavailableException(
        'Chưa cấu hình LANDING_URL nên không lấy được danh mục ô nội dung',
      );

    try {
      const res = await fetch(`${goc}/api/content-schema?locale=${locale}`);
      if (!res.ok) throw new Error(`landing trả ${res.status}`);
      const raw: unknown = await res.json();
      // Kèm địa chỉ landing: admin cần nó để nhúng khung xem trước, mà chỉ
      // backend mới biết landing nằm ở đâu.
      const data =
        typeof raw === 'object' && raw !== null ? { ...raw, landingUrl: goc } : raw;
      this.nhoTam.set(locale, { luc: Date.now(), data });
      return data;
    } catch (e) {
      // Giữ bản cũ còn hơn không có gì: người đang sửa dở vẫn thấy đủ ô.
      if (cu) {
        this.logger.warn(`Không lấy được danh mục mới, dùng bản nhớ tạm: ${String(e)}`);
        return cu.data;
      }
      throw new ServiceUnavailableException(
        `Không lấy được danh mục ô nội dung từ landing: ${String(e)}`,
      );
    }
  }

  /**
   * Lớp phủ của một ngôn ngữ, dạng map phẳng.
   *
   * Landing gọi cửa này mỗi lần dựng lại trang (có cache 60 giây), nên nó phải
   * là MỘT truy vấn và không kèm gì thừa: không tên người sửa, không thời điểm.
   * Không có dòng nào thì trả map rỗng — landing hiểu là dùng hết bản mặc định.
   */
  async publicMap(locale: CmsLocale): Promise<Record<string, string>> {
    const rows = await this.prisma.landingContent.findMany({
      where: { locale },
      select: { keyPath: true, value: true },
    });
    return Object.fromEntries(rows.map((r) => [r.keyPath, r.value]));
  }

  /** Bản đầy đủ cho màn quản trị: kèm ai sửa và sửa lúc nào. */
  async adminList(locale: CmsLocale): Promise<ContentValueDto[]> {
    const rows = await this.prisma.landingContent.findMany({
      where: { locale },
      select: {
        keyPath: true,
        value: true,
        updatedAt: true,
        editor: { select: { fullName: true } },
      },
      orderBy: { keyPath: 'asc' },
    });
    return rows.map((r) => ({
      keyPath: r.keyPath,
      value: r.value,
      updatedBy: r.editor?.fullName ?? null,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Lưu một loạt ô đã sửa.
   *
   * Kiểm TOÀN BỘ khoá trước khi ghi dòng đầu tiên: một khoá hỏng giữa chừng mà
   * đã ghi mất nửa thì người dùng không biết phần nào vào, phần nào không.
   *
   * Ghi trong một transaction, mỗi ô một upsert. Số ô mỗi lần lưu là một
   * section chứ không phải cả từ điển (DTO chặn ở 200) nên vòng lặp này không
   * phải chỗ cần tối ưu.
   */
  async save(dto: SaveContentDto, actor: AuthenticatedUser): Promise<number> {
    for (const e of dto.entries) assertKeyPath(e.keyPath);

    // Ô ảnh nở ra thành một dòng cho mỗi ngôn ngữ — xem localesFor.
    const dong = dto.entries.flatMap((e) =>
      localesFor(dto.locale, e.keyPath).map((locale) => ({ locale, ...e })),
    );

    await this.prisma.$transaction(
      dong.map((d) =>
        d.value === null
          ? // null = khôi phục: xoá dòng ghi đè. deleteMany vì ô chưa từng bị
            // sửa thì không có dòng nào, và đó không phải lỗi.
            this.prisma.landingContent.deleteMany({
              where: { locale: d.locale, keyPath: d.keyPath },
            })
          : this.prisma.landingContent.upsert({
              where: { locale_keyPath: { locale: d.locale, keyPath: d.keyPath } },
              create: {
                locale: d.locale,
                keyPath: d.keyPath,
                value: d.value,
                updatedBy: actor.id,
              },
              update: { value: d.value, updatedBy: actor.id, updatedAt: new Date() },
            }),
      ),
    );

    await this.activity.log(null, {
      entity: 'landing_content',
      entityId: 0,
      action: 'update',
      actorId: actor.id,
      // Chỉ ghi danh sách khoá, không ghi nội dung: nhật ký để trả lời "ai đổi
      // ô nào lúc nào", không phải để lưu bản sao thứ hai của cả trang.
      detail: {
        locale: dto.locale,
        keyPaths: dto.entries.filter((e) => e.value !== null).map((e) => e.keyPath),
        resetKeyPaths: dto.entries.filter((e) => e.value === null).map((e) => e.keyPath),
      },
    });
    await this.landing.lamMoi(THE_NOI_DUNG);
    return dto.entries.length;
  }

  /**
   * Khôi phục một ô về bản mặc định trong code = XOÁ dòng ghi đè.
   *
   * Không cần biết chuỗi gốc là gì, và cũng không nên biết: bản gốc nằm trong
   * code của landing, chép sang đây là tạo ra bản sao thứ hai sẽ lệch dần.
   */
  async reset(
    locale: CmsLocale,
    keyPath: string,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    // Khôi phục ô ảnh thì gỡ ở mọi ngôn ngữ, đối xứng với lúc lưu: bỏ sót một
    // bản là trang ngôn ngữ đó giữ mãi tấm ảnh vừa được gỡ.
    const { count } = await this.prisma.landingContent.deleteMany({
      where: { locale: { in: localesFor(locale, keyPath) }, keyPath },
    });
    if (count === 0) return false;

    await this.activity.log(null, {
      entity: 'landing_content',
      entityId: 0,
      action: 'delete',
      actorId: actor.id,
      detail: { locale, keyPath },
    });
    await this.landing.lamMoi(THE_NOI_DUNG);
    return true;
  }
}
