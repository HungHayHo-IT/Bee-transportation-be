import { HttpException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PermissionMatrixService } from '@/common/permissions/permission-matrix.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { GioiHanTraGia, KHOA_GIOI_HAN } from './gioi-han-tra-gia';

/**
 * Trần số lần tra giá. Nó là thứ chặn chuyện ngồi tra lần lượt từng cặp địa
 * điểm để dựng lại cả bảng giá — nên nếu nó hỏng thì không có gì báo, chỉ là
 * bảng giá lặng lẽ ra ngoài.
 */

const NGUOI = (id: number, roles: string[]): AuthenticatedUser => ({
  id, email: `u${id}@bee.vn`, fullName: `U${id}`, roles,
  departmentId: null, canViewCompanyReport: false, mustChangePassword: false,
});

const dung = (muc: string, giaTri: string | null) => {
  const prisma = {
    appSetting: {
      findUnique: jest.fn(() =>
        Promise.resolve(giaTri === null ? null : { key: KHOA_GIOI_HAN, value: giaTri })),
    },
  } as unknown as PrismaService;
  const matrix = { mucCua: jest.fn(() => Promise.resolve(muc)) } as unknown as PermissionMatrixService;
  return new GioiHanTraGia(prisma, matrix);
};

describe('tran so lan tra gia', () => {
  it('cham tran thi nem 429', async () => {
    const g = dung('none', '3');
    const u = NGUOI(1, ['sale']);
    for (let i = 0; i < 3; i += 1) await g.ghiNhan(u);
    await expect(g.ghiNhan(u)).rejects.toBeInstanceOf(HttpException);
    await expect(g.ghiNhan(u)).rejects.toMatchObject({ status: 429 });
  });

  it('dem RIENG tung nguoi, khong dung chung mot bo dem', async () => {
    const g = dung('none', '2');
    await g.ghiNhan(NGUOI(1, ['sale']));
    await g.ghiNhan(NGUOI(1, ['sale']));
    // Nguoi thu hai van con nguyen han cua minh.
    await expect(g.ghiNhan(NGUOI(2, ['sale']))).resolves.toBeUndefined();
  });

  /**
   * Voi nguoi mo duoc ca bang gia, cai tran nay khong bao ve gi: ho doc tron
   * bang trong mot lan bam. Chan ho o duong tra tung tuyen chi la lam phien.
   */
  it('nguoi mo duoc ca bang gia thi KHONG bi tinh', async () => {
    const g = dung('view', '1');
    const u = NGUOI(3, ['manager']);
    for (let i = 0; i < 10; i += 1) await g.ghiNhan(u);
  });

  /**
   * Mot loi go vao o cau hinh KHONG duoc lam hong man bao gia cua ca cong ty.
   * `Number('nhieu')` la NaN, va NaN >= tran luon sai -> neu khong chan thi
   * tran thanh 0 va moi lan tra deu 429.
   */
  it('gia tri cau hinh hong thi roi ve mac dinh, KHONG thanh 0', async () => {
    for (const hong of ['nhieu', '', '-5', '0']) {
      const g = dung('none', hong);
      const u = NGUOI(4, ['sale']);
      for (let i = 0; i < 60; i += 1) await g.ghiNhan(u);
      await expect(g.ghiNhan(u)).rejects.toMatchObject({ status: 429 });
    }
  });

  it('chua co dong cau hinh thi dung mac dinh 60', async () => {
    const g = dung('none', null);
    const u = NGUOI(5, ['sale']);
    for (let i = 0; i < 60; i += 1) await g.ghiNhan(u);
    await expect(g.ghiNhan(u)).rejects.toMatchObject({ status: 429 });
  });

  it('cham tran roi KHONG cong them luot — doi het gio la tra duoc tiep', async () => {
    const g = dung('none', '1');
    const u = NGUOI(6, ['sale']);
    await g.ghiNhan(u);
    await expect(g.ghiNhan(u)).rejects.toMatchObject({ status: 429 });
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61 * 60 * 1000);
    await expect(g.ghiNhan(u)).resolves.toBeUndefined();
    jest.restoreAllMocks();
  });
});
