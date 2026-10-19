import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { LocationsService } from './locations.service';

/**
 * Master data địa điểm: hai luật mà màn "chọn tỉnh rồi chọn địa điểm" dựa vào.
 *
 * 1. TỈNH phải nằm trong danh mục 34 đơn vị sau sáp nhập 2025. Để text tự do
 *    thì 'Quảng Nam' và 'Đà Nẵng' là hai tỉnh khác nhau trong khi chúng đã
 *    nhập làm một — danh sách địa điểm của cùng một tỉnh bị chia đôi.
 *
 * 2. TRÙNG TÊN bắt ở tầng ứng dụng để trả câu tiếng Việt, nhưng hỏi bằng CHÍNH
 *    hàm `loc_name_key()` của CSDL. Test này chốt chuyện đó: nếu ai đó thay
 *    `$queryRaw` bằng một bản chuẩn hoá viết lại bằng TypeScript thì câu lệnh
 *    SQL không còn gọi `loc_name_key` nữa, và bài test dưới đây đỏ.
 */

const NGUOI: AuthenticatedUser = {
  id: 1, email: 'a@bee.vn', fullName: 'A', roles: ['admin'],
  departmentId: null, canViewCompanyReport: false, mustChangePassword: false,
};

interface GiaLap {
  prisma: PrismaService;
  cauSql: string[];
  daTao: Record<string, unknown>[];
}

/** Ba khu vực như trên CSDL thật; `[]` = chưa tạo khu vực nào. */
const KHU_VUC = [
  { id: 1, name: 'Miền Bắc' }, { id: 2, name: 'Miền Trung' }, { id: 3, name: 'Miền Nam' },
];

const mkPrisma = (
  trung: { id: number; name: string }[] = [],
  khuVuc: { id: number; name: string }[] = KHU_VUC,
): GiaLap => {
  const cauSql: string[] = [];
  const daTao: Record<string, unknown>[] = [];
  const prisma = {
    // Prisma gọi $queryRaw kiểu tagged template: mảng chuỗi + các tham số.
    $queryRaw: jest.fn((chuoi: TemplateStringsArray) => {
      cauSql.push(chuoi.join('?'));
      return Promise.resolve(trung);
    }),
    location: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        daTao.push(data);
        return Promise.resolve({ id: 9, isActive: true, of1Id: null, ...data });
      }),
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    priceRegion: {
      findFirst: jest.fn(({ where }: { where: { name: { equals: string } } }) =>
        Promise.resolve(khuVuc.find((r) => r.name === where.name.equals) ?? null)),
    },
  } as unknown as PrismaService;
  return { prisma, cauSql, daTao };
};

describe('tao dia diem — chuan hoa tinh', () => {
  it('ten tinh CU duoc quy ve don vi da nhan sap nhap', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation(
      { name: 'KCN Tam Thăng', province: 'Quảng Nam' }, NGUOI,
    );
    expect(g.daTao[0]!.province).toBe('Đà Nẵng');
  });

  it('tinh khong co that bi tu choi, khong lang le luu null', async () => {
    const g = mkPrisma();
    await expect(
      new LocationsService(g.prisma).createLocation(
        { name: 'Kho X', province: 'Xứ Mộng Mơ' }, NGUOI,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bo trong tinh van tao duoc', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation({ name: 'Kho Y' }, NGUOI);
    expect(g.daTao[0]!.province).toBeNull();
  });
});

describe('tao dia diem — khu vuc (068)', () => {
  /**
   * TỈNH quyết định khu vực, không phải "địa điểm nào tạo trước thì địa điểm
   * sau theo". Luật kế thừa theo hàng xóm từng để lại 346/486 địa điểm không
   * thuộc khu vực nào — tuyến đi từ chúng không hiện ở bảng tuyến của bất kỳ
   * khu vực nào — và kéo 6 địa điểm TP.HCM vào Miền Trung.
   */
  it('tinh quyet dinh khu vuc', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation(
      { name: 'Kho Hòa Khánh', province: 'Đà Nẵng' }, NGUOI,
    );
    expect(g.daTao[0]!.regionId).toBe(2);
  });

  /** Tỉnh chưa có địa điểm nào vẫn phải ra đúng khu vực — đây là cả vấn đề. */
  it('tinh chua co dia diem nao van ra dung khu vuc', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation(
      { name: 'Kho Lai Châu', province: 'Lai Châu' }, NGUOI,
    );
    expect(g.daTao[0]!.regionId).toBe(1);
  });

  /** Tên tỉnh CŨ cũng phải ra đúng miền sau khi quy về đơn vị đã sáp nhập. */
  it('ten tinh cu quy ve roi moi chia mien', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation(
      { name: 'KCN Mỹ Phước', province: 'Bình Dương' }, NGUOI,
    );
    expect(g.daTao[0]!.province).toBe('TP. Hồ Chí Minh');
    expect(g.daTao[0]!.regionId).toBe(3);
  });

  /** Khai thẳng thì tin người khai, không suy diễn lại. */
  it('khai khu vuc thi giu nguyen', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation(
      { name: 'Kho Hòa Khánh', province: 'Đà Nẵng', regionId: 7 }, NGUOI,
    );
    expect(g.daTao[0]!.regionId).toBe(7);
  });

  /** Không khai tỉnh thì không có gì để suy — vẫn tạo được, chỉ là chưa thuộc đâu. */
  it('khong khai tinh thi de null', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation({ name: 'Kho Y' }, NGUOI);
    expect(g.daTao[0]!.regionId).toBeNull();
  });

  /**
   * Admin đổi tên khu vực hay xoá hết thì KHÔNG gán bừa vào khu vực còn lại:
   * để null, địa điểm hiện "Chưa có khu vực" — một thiếu sót nhìn thấy được.
   */
  it('khong co khu vuc mang ten do thi de null', async () => {
    const g = mkPrisma([], [{ id: 9, name: 'Khu vực A' }]);
    await new LocationsService(g.prisma).createLocation(
      { name: 'Kho Hòa Khánh', province: 'Đà Nẵng' }, NGUOI,
    );
    expect(g.daTao[0]!.regionId).toBeNull();
  });
});

describe('tao dia diem — dia chi', () => {
  /**
   * Bảng giá nhập vào phần lớn chỉ có MỘT ô cho mỗi đầu tuyến — "330 QL1A,
   * Quận Bình Tân" — vừa là tên vừa là chỗ giao hàng thật. Nên khi không khai
   * địa chỉ riêng, địa chỉ trả ra chính là cái tên đó, chứ không để trống.
   */
  it('khong khai dia chi thi tra ve chinh cai ten', async () => {
    const g = mkPrisma();
    const ra = await new LocationsService(g.prisma).createLocation(
      { name: '330 QL1A, Quận Bình Tân', province: 'TP Hồ Chí Minh' }, NGUOI,
    );
    expect(ra.address).toBe('330 QL1A, Quận Bình Tân');
    // ... nhưng KHÔNG chép xuống CSDL: chép là có hai bản của cùng một chuỗi.
    expect(g.daTao[0]!.address).toBeNull();
  });

  it('khai dia chi that thi giu nguyen, khong de ten de len', async () => {
    const g = mkPrisma();
    const ra = await new LocationsService(g.prisma).createLocation(
      { name: 'Kho Bình Tân', address: '330 QL1A', province: 'TP Hồ Chí Minh' }, NGUOI,
    );
    expect(ra.address).toBe('330 QL1A');
  });
});

describe('tao dia diem — chong trung', () => {
  /**
   * Vế quyết định: câu hỏi "đã có chưa" phải chạy qua `loc_name_key()` của
   * CSDL. Chính hàm đó là thứ gộp 'KCN CAO. HÒA KHÁNH' với 'KCN CAO, HÒA
   * KHÁNH' — bảng giá thật có cả hai cách viết.
   */
  it('hoi bang chinh ham khoa cua CSDL', async () => {
    const g = mkPrisma();
    await new LocationsService(g.prisma).createLocation(
      { name: 'KCN Cao. Hòa Khánh', province: 'Đà Nẵng' }, NGUOI,
    );
    expect(g.cauSql[0]).toContain('loc_name_key(name) = loc_name_key(');
  });

  it('da co thi bao TEN DANG CO, khong phai ten vua go', async () => {
    const g = mkPrisma([{ id: 3, name: 'KCN CAO, HÒA KHÁNH' }]);
    await expect(
      new LocationsService(g.prisma).createLocation(
        { name: 'KCN CAO. HÒA KHÁNH', province: 'Đà Nẵng' }, NGUOI,
      ),
    ).rejects.toThrow(/KCN CAO, HÒA KHÁNH/);
  });

  it('da co thi nem 409, khong tao them ban thu hai', async () => {
    const g = mkPrisma([{ id: 3, name: 'Kho Đà Nẵng' }]);
    await expect(
      new LocationsService(g.prisma).createLocation({ name: 'Kho Đà Nẵng' }, NGUOI),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(g.daTao).toHaveLength(0);
  });
});
