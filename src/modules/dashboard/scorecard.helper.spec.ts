import { tiLeChuyenDoi, xepHangTheoDiem } from './scorecard.helper';

describe('ti le chuyen doi', () => {
  /**
   * Mau so 0 tra `null`, KHONG tra 0.
   *
   * Nguoi chua co don nao da ra ket qua thi ti le cua ho chua ton tai — in ra
   * "0%" la noi rang ho khong chot duoc don nao, trong khi thuc te la chua co
   * don nao de chot. Hai chuyen do khac han nhau khi danh gia mot nguoi.
   */
  it('chua co don da ra ket qua thi chua co ti le', () => {
    expect(tiLeChuyenDoi(0, 0)).toBeNull();
    expect(tiLeChuyenDoi(5, 0)).toBeNull();
  });

  it('lam tron mot chu so thap phan', () => {
    expect(tiLeChuyenDoi(1, 3)).toBe(33.3);
    expect(tiLeChuyenDoi(2, 3)).toBe(66.7);
    expect(tiLeChuyenDoi(3, 3)).toBe(100);
  });

  it('khong chot don nao thi la 0, khong phai null', () => {
    expect(tiLeChuyenDoi(0, 4)).toBe(0);
  });
});

describe('xep hang bang diem', () => {
  const nguoi = (id: number, chot: number, quyet: number, doanhThu: number) =>
    ({ userId: id, fullName: `N${id}`, orderCount: 10, decidedCount: quyet,
       closedCount: chot, quotedTotal: 0, revenue: doanhThu });

  /**
   * Xep theo DOANH THU truoc, ti le sau.
   *
   * Ti le dung mot minh thi nguoi co 1 don thang 1 se dung tren nguoi co 40
   * don thang 30 — 100% so voi 75%. Doanh thu la thu cong ty thuc su nhan ve,
   * nen no di truoc; ti le la cach doc chat luong cua khoi luong do.
   */
  it('doanh thu cao hon dung tren', () => {
    const ra = xepHangTheoDiem([nguoi(1, 1, 1, 100), nguoi(2, 30, 40, 5000)]);
    expect(ra[0]!.userId).toBe(2);
  });

  it('doanh thu bang nhau thi ti le cao hon dung tren', () => {
    const ra = xepHangTheoDiem([nguoi(1, 1, 4, 1000), nguoi(2, 3, 4, 1000)]);
    expect(ra[0]!.userId).toBe(2);
  });

  /** Nguoi chua co ti le xep sau nguoi da co, khong phai coi nhu 0%. */
  it('nguoi chua co ti le xuong cuoi khi doanh thu bang nhau', () => {
    const ra = xepHangTheoDiem([nguoi(1, 0, 0, 0), nguoi(2, 0, 3, 0)]);
    expect(ra[0]!.userId).toBe(2);
  });
});
