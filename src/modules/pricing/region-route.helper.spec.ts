import { Prisma } from '@prisma/client';
import { raTuyen, type TuyenDayDu } from './region-route.helper';

const diaDiem = (id: number, name: string, province: string | null, region: { id: number; name: string } | null) =>
  ({ id, name, province, region } as TuyenDayDu['origin']);

const gia = (
  kind: 'FCL' | 'LCL',
  unitCode: string,
  oneWay: number | null,
  roundTrip: number | null,
  sortOrder = 0,
) => ({
  kind,
  unitCode,
  unit: { label: unitCode, sortOrder },
  oneWayPrice: oneWay === null ? null : new Prisma.Decimal(oneWay),
  roundTripPrice: roundTrip === null ? null : new Prisma.Decimal(roundTrip),
}) as TuyenDayDu['prices'][number];

const tuyen = (prices: TuyenDayDu['prices']): TuyenDayDu => ({
  id: 9,
  sessionId: 1,
  originId: 1,
  destinationId: 2,
  roundTripKm: 620,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  origin: diaDiem(1, 'Kho Đà Nẵng', 'Đà Nẵng', { id: 2, name: 'Miền Trung' }),
  destination: diaDiem(2, 'KCN VSIP Quảng Ngãi', 'Quảng Ngãi', null),
  prices,
});

describe('gom gia cua mot tuyen theo FCL/LCL', () => {
  /**
   * Bang gia luu PHANG mot dong moi bac tai, con giao dien doc theo khoi
   * FCL/LCL. Gom sai la gia container nam trong khoi hang le — sai ma trong
   * nhu that.
   */
  it('mot khoi cho FCL, mot khoi cho LCL', () => {
    const kq = raTuyen(tuyen([
      gia('LCL', 'TRUCK_1T4', 2000000, 3500000),
      gia('LCL', 'TRUCK_5T', 4000000, 7000000),
      gia('FCL', 'CONT20DC_LE17T', 6000000, null),
    ]));
    expect(kq.services.map((s) => s.kind)).toEqual(['LCL', 'FCL']);
    expect(kq.services[0].prices.map((p) => p.unitCode)).toEqual(['TRUCK_1T4', 'TRUCK_5T']);
    expect(kq.services[1].prices).toHaveLength(1);
  });

  /** Decimal cua Prisma phai ra SO, khong phai mot doi tuong — JSON hoa thanh "1.4" la giao dien hong. */
  it('tra ve so, khong tra ve Decimal', () => {
    const kq = raTuyen(tuyen([gia('LCL', 'TRUCK_2T4', 1500000, null)]));
    const p = kq.services[0].prices[0];
    expect(p.unitCode).toBe('TRUCK_2T4');
    expect(p.oneWayPrice).toBe(1500000);
    /* Chieu khong chay giu nguyen null. Doi thanh 0 la noi "tuyen nay mien
       phi", va o bao gia se dien vao mot con so khong ai bao gio bao. */
    expect(p.roundTripPrice).toBeNull();
  });

  /**
   * Khu vuc lay tu dia diem NHAN, khong phai dia diem giao. Day la ca cai luat
   * ma 061 dung de hai man hinh khong lech nhau.
   */
  it('khu vuc theo dau nhan', () => {
    const kq = raTuyen(tuyen([gia('LCL', 'TRUCK_5T', 1000000, null)]));
    expect(kq.regionId).toBe(2);
    expect(kq.regionName).toBe('Miền Trung');
    expect(kq.destination.province).toBe('Quảng Ngãi');
  });

  /** Dia diem chua gan khu vuc thi tuyen khong thuoc khu vuc nao — null, khong ne tranh. */
  it('dau nhan chua co khu vuc -> null', () => {
    const t = tuyen([gia('LCL', 'TRUCK_5T', 1000000, null)]);
    const kq = raTuyen({ ...t, origin: diaDiem(1, 'Kho lạ', null, null) });
    expect(kq.regionId).toBeNull();
    expect(kq.regionName).toBeNull();
  });
});

/**
 * Km 2 chieu thuoc TUYEN (062). Truoc do no nam o tung muc gia, tuc la cung
 * mot con so chep lai 8-10 lan cho mot tuyen — chi can mot lan go lech la
 * khong ai biet con nao dung.
 */
describe('km 2 chieu', () => {
  it('doc tu tuyen, khong doc tu muc gia', () => {
    const kq = raTuyen(tuyen([gia('LCL', 'TRUCK_5T', 1000000, null)]));
    expect(kq.roundTripKm).toBe(620);
  });
});
