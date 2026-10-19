import { BadRequestException } from '@nestjs/common';
import {
  PriceSessionStatus,
  assertChuyenPhien,
  docGiaTuChuoi,
  gopDongTrung,
  khoaTuyen,
} from './price-session.helper';

describe('chuyen trang thai phien gia', () => {
  /**
   * Phien 'draft' la ban dang soan — chua ai thay. Kich hoat no la cong bo.
   * Phien 'archived' da bi thay the: bat no song lai thi bang gia quay nguoc
   * ve mot ban cu ma khong ai co y dinh do, nen phai tao phien moi (chep tu
   * phien cu) chu khong phai hoi sinh.
   */
  it('chi phien dang soan moi kich hoat duoc', () => {
    expect(() => assertChuyenPhien('draft', 'active')).not.toThrow();
    expect(() => assertChuyenPhien('archived', 'active')).toThrow(BadRequestException);
    expect(() => assertChuyenPhien('active', 'active')).toThrow(BadRequestException);
  });

  /** Luu tru mot phien dang soan la vo nghia: no chua tung duoc ap dung. */
  it('chi phien dang ap dung moi luu tru duoc', () => {
    expect(() => assertChuyenPhien('active', 'archived')).not.toThrow();
    expect(() => assertChuyenPhien('draft', 'archived')).toThrow(BadRequestException);
  });

  it('khong quay nguoc ve dang soan', () => {
    for (const tu of ['active', 'archived'] as PriceSessionStatus[]) {
      expect(() => assertChuyenPhien(tu, 'draft')).toThrow(BadRequestException);
    }
  });
});

describe('doc gia tu chuoi — cot Gia cua file import', () => {
  /**
   * Nguoi ta dan tu Excel, va Excel tra ve du kieu: '1.200.000', '1,200,000',
   * ' 1200000 ', 1200000. Bo het dau phan cach roi doc — dau phan cach hang
   * nghin la CACH VIET, khong phai gia tri.
   */
  it('bo dau phan cach hang nghin', () => {
    expect(docGiaTuChuoi('1.200.000')).toBe(1200000);
    expect(docGiaTuChuoi('1,200,000')).toBe(1200000);
    expect(docGiaTuChuoi(' 1200000 ')).toBe(1200000);
    expect(docGiaTuChuoi(1200000)).toBe(1200000);
  });

  /**
   * Tra null chu khong tra 0. Mot o de trong hay go nham thanh chu thi phai
   * bao "dong nay hong" — bien no thanh 0 la im lang bao khach gia khong dong.
   */
  it('o trong hay chu la khong doc duoc', () => {
    for (const x of ['', '   ', 'lien he', null, undefined]) {
      expect(docGiaTuChuoi(x)).toBeNull();
    }
  });

  it('gia am khong nhan', () => {
    expect(docGiaTuChuoi('-5000')).toBeNull();
  });

  /** Gia le khong co trong bang nay — don vi la dong, lam tron xuong. */
  it('lam tron ve dong', () => {
    expect(docGiaTuChuoi('1200000.6')).toBe(1200000);
  });
});

describe('khoa mot dong gia', () => {
  /**
   * Bon thanh phan, dung thu tu. Dung de bat dong trung NGAY TRONG FILE
   * import — rang buoc unique cua DB chi bat duoc sau khi da ghi mot nua.
   */
  it('gop du bon thanh phan', () => {
    expect(khoaTuyen(1, 2, 'TRUCK_5T')).toBe('1>2@TRUCK_5T');
  });

  it('doi chieu di chieu ve la hai tuyen khac nhau', () => {
    expect(khoaTuyen(1, 2, 'TRUCK_5T')).not.toBe(khoaTuyen(2, 1, 'TRUCK_5T'));
  });

  /**
   * Ve quyet dinh cua 055. Mot tuyen container co tam dong gia, khac nhau DUNG
   * o don vi tinh. Thieu don vi tinh trong khoa thi bay dong bien mat ngay
   * trong bo nhap, truoc khi DB kip noi gi.
   */
  it('cung tuyen khac don vi tinh la hai dong khac nhau', () => {
    expect(khoaTuyen(1, 2, 'CONT20DC_LE17T')).not.toBe(khoaTuyen(1, 2, 'CONT40DC_LE22T'));
  });
});

describe('gop dong trung trong file import', () => {
  const dong = (o: number, d: number, _s: number, gia: number, dv = 'TRUCK_5T') =>
    ({ originId: o, destinationId: d, unitCode: dv, price: gia });

  /**
   * File nguoi ta gui len thuong co dong lap — dan hai lan, hoac sua roi dan
   * lai ca khoi. Lay dong CUOI: no la ban sua sau cung. Bao ra so dong da gop
   * de nguoi import biet file cua minh co van de, chu khong im lang.
   */
  it('dong sau de len dong truoc, va dem so lan gop', () => {
    const { ra, soTrung } = gopDongTrung([
      dong(1, 2, 3, 100),
      dong(1, 2, 3, 200),
      dong(1, 3, 3, 500),
    ]);
    expect(ra).toHaveLength(2);
    expect(ra[0]!.price).toBe(200);
    expect(soTrung).toBe(1);
  });

  it('khong co dong trung thi giu nguyen thu tu', () => {
    const { ra, soTrung } = gopDongTrung([dong(1, 2, 3, 100), dong(2, 1, 3, 100)]);
    expect(ra).toHaveLength(2);
    expect(soTrung).toBe(0);
  });

  /** Tam dong cua mot tuyen container phai song ca tam. */
  it('cung tuyen, tam don vi tinh khac nhau: KHONG gop dong nao', () => {
    const dv = ['CONT20DC_LE17T', 'CONT20DC_LE18T', 'CONT20DC_LE22T', 'CONT20DC_GT22T',
                'CONT40DC_LE16T', 'CONT40DC_LE17T', 'CONT40DC_LE22T', 'CONT40DC_GT22T'];
    const { ra, soTrung } = gopDongTrung(dv.map((u, i) => dong(1, 2, 3, 1000 + i, u)));
    expect(ra).toHaveLength(8);
    expect(soTrung).toBe(0);
  });
});
