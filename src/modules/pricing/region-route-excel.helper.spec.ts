import {
  COT_NHAN_DANG, coChieuVe, docKind, docTieuDe, giaHaiChieu, gomTheoTuyen, maDonViMoi, tieuDe,
  type DongNhap,
} from './region-route-excel.helper';

const DON_VI = [
  { code: 'TRUCK_1T4', label: 'Xe 1.4T' },
  { code: 'CONT20DC_LE17T', label: "20'DC ≤ 17 tấn" },
];

const SO_NHAN_DANG = Object.keys(COT_NHAN_DANG).length;

/** Dung hang tieu de that cua file nguoi dung gui len (pricing-template.xlsx). */
const TIEU_DE_THAT = [
  'Khu vực *', 'Tỉnh đi *', 'Địa chỉ đi *', 'Tỉnh đến *', 'Địa chỉ đến *',
  'Km 2 chiều', 'Mã dịch vụ con',
  '1.4T', '2.4T', '3.5T', '5T', '8T', '10T', '20DC', '40DC', '', '',
];

/** FCL/LCL doc tu o "Loai hang" — nhan ca ba cach nguoi ta hay ghi. */
describe('doc FCL hay LCL', () => {
  it.each([
    ['FCL', 'FCL'],
    ['lcl', 'LCL'],
    ['DOMESTIC_FCL', 'FCL'],
    ['EXPORT_LCL', 'LCL'],
    ['Nội địa nguyên container (FCL)', 'FCL'],
    ['Nội địa hàng lẻ (LCL)', 'LCL'],
  ])('%s -> %s', (raw, kind) => {
    expect(docKind(raw)).toBe(kind);
  });

  /**
   * Khong doan: mot dong ghi ma khong co duoi FCL/LCL ma duoc xep bua vao FCL
   * la gia container nam trong khoi hang le.
   */
  it.each(['', 'EXPORT_AIR', 'Hàng rời', 'FCLX'])('%s -> null', (raw) => {
    expect(docKind(raw)).toBeNull();
  });
});

const dong = (o: Partial<DongNhap> = {}): DongNhap => ({
  dong: 2,
  regionName: 'Miền Trung',
  originProvince: 'Đà Nẵng',
  originName: 'Kho Đà Nẵng',
  destinationProvince: 'Quảng Ngãi',
  destinationName: 'KCN VSIP',
  roundTripKm: 620,
  kindRaw: 'FCL',
  kind: 'FCL',
  gia: [{ unitCode: 'TRUCK_1T4', oneWayPrice: 2000000, roundTripPrice: 3500000 }],
  ...o,
});

describe('tieu de file he thong sinh ra', () => {
  it('cac cot nhan dang roi HAI cot moi don vi tinh', () => {
    const h = tieuDe(DON_VI);
    expect(h).toHaveLength(SO_NHAN_DANG + DON_VI.length * 2);
    expect(h.slice(SO_NHAN_DANG)).toEqual([
      'Xe 1.4T (1 chiều)', 'Xe 1.4T (2 chiều)',
      "20'DC ≤ 17 tấn (1 chiều)", "20'DC ≤ 17 tấn (2 chiều)",
    ]);
  });

  it('doc lai duoc chinh file minh sinh ra', () => {
    const { nhanDang, gia } = docTieuDe(tieuDe(DON_VI), DON_VI);
    expect(nhanDang.originName).toBe(3);
    expect(nhanDang.kind).toBe(SO_NHAN_DANG);
    expect(gia).toEqual([
      { cot: SO_NHAN_DANG + 1, unitCode: 'TRUCK_1T4', tenDonVi: 'Xe 1.4T', chieu: 'mot' },
      { cot: SO_NHAN_DANG + 2, unitCode: 'TRUCK_1T4', tenDonVi: 'Xe 1.4T', chieu: 'hai' },
      { cot: SO_NHAN_DANG + 3, unitCode: 'CONT20DC_LE17T', tenDonVi: "20'DC ≤ 17 tấn", chieu: 'mot' },
      { cot: SO_NHAN_DANG + 4, unitCode: 'CONT20DC_LE17T', tenDonVi: "20'DC ≤ 17 tấn", chieu: 'hai' },
    ]);
  });
});

/**
 * Bang gia THAT nguoi ta gui len khong giong file he thong sinh ra: khong co
 * cot "Ten dich vu con", cot gia ghi gon la '1.4T', va mot don vi tinh chi co
 * MOT cot. Doc theo VI TRI cot thi cot gia dau tien bi hieu thanh ten dich vu
 * con va ca file truot — ma cau bao loi lai noi ve chuyen khac.
 */
describe('doc hang tieu de cua file that', () => {
  const { nhanDang, gia } = docTieuDe(TIEU_DE_THAT, DON_VI);

  /* Cot thu 7 trong file that ghi "Ma dich vu con" — ten cu cua cot "Loai
     hang". Nhan no de bang gia da gui di truoc day nhap lai duoc. */
  it('nhan ra cot nhan dang theo TEN, bo qua dau sao', () => {
    expect(nhanDang).toEqual({
      regionName: 1,
      originProvince: 2,
      originName: 3,
      destinationProvince: 4,
      destinationName: 5,
      roundTripKm: 6,
      kind: 7,
    });
  });

  it('tam cot gia, cot thu tam tro di', () => {
    expect(gia.map((g) => g.cot)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  /**
   * Bang gia cua Bee ghi MOT con so cho moi loai xe, va do la cuoc MOT chieu;
   * gia hai chieu suy ra bang `giaHaiChieu()` (+50%).
   */
  it('cot khong co hau to tinh la GIA MOT CHIEU', () => {
    expect(gia.every((g) => g.chieu === 'mot')).toBe(true);
  });

  /** '1.4T' phai gap duoc 'Xe 1.4T': khac nhau dung mot tien to. */
  it('ten viet gon van khop don vi tinh dang co', () => {
    expect(gia.find((g) => g.tenDonVi === '1.4T')?.unitCode).toBe('TRUCK_1T4');
  });

  /**
   * '20DC' KHONG duoc khop bua vao mot trong bon bac tai "20'DC ≤ 17 tan"...:
   * chon bua mot cai la gia cua bac nay roi vao bac khac. De null, de ben goi
   * tao mot don vi tinh moi.
   */
  it('ten chua co trong danh muc thi de null, khong doan', () => {
    for (const ten of ['8T', '20DC', '40DC'])
      expect(gia.find((g) => g.tenDonVi === ten)?.unitCode).toBeNull();
  });

  it('hai cot cuoi khong co tieu de thi bo qua', () => {
    expect(gia).toHaveLength(8);
  });
});

describe('ma cho don vi tinh moi', () => {
  it.each([
    ['20DC', '20DC'],
    ['8T', '8T'],
    ["40'DC", '40_DC'],
    ['Xe 1.4T', 'XE_1_4T'],
    // Bo dau TRUOC khi thay ky tu la: '5T Bat' chu khong phai '5T_B_T'.
    ['5T Bạt', '5T_BAT'],
    ['10T Kín', '10T_KIN'],
    ['Xe đầu kéo', 'XE_DAU_KEO'],
  ])('%s -> %s', (ten, ma) => {
    expect(maDonViMoi(ten)).toBe(ma);
  });

  /**
   * Bo dau thi hai ten chi khac dau ra CUNG mot ma — day la gioi han co that
   * cua ham nay, va no duoc xu ly o tang tren: `themDonVi` gap ma da co nhung
   * NHAN khac thi lay ma trong ke tiep ('5T_BAT_2'), khong dung lai. Khong
   * chen cho do thi hai bac gia am tham nhap lam mot.
   */
  it('hai ten chi khac dau ra cung ma goc — tang tren phai tach ra', () => {
    expect(maDonViMoi('5T Bạt')).toBe(maDonViMoi('5T Bất'));
  });
});

describe('gom dong thanh tuyen', () => {
  /** Cung CAP DIA DIEM = mot tuyen, du dich vu con khac nhau. */
  it('hai khoi FCL/LCL cua cung mot tuyen gom lam mot tuyen', () => {
    const { tuyen, deLen } = gomTheoTuyen([
      dong(),
      dong({ dong: 3, kindRaw: 'LCL', kind: 'LCL' }),
    ]);
    expect(tuyen.size).toBe(1);
    expect([...tuyen.values()][0]!.dichVu.size).toBe(2);
    expect(deLen).toBe(0);
  });

  /** Hai kho trung ten o hai tinh la HAI tuyen khac nhau. */
  it('cung ten kho nhung khac tinh thi khong gom', () => {
    const { tuyen } = gomTheoTuyen([dong(), dong({ dong: 3, originProvince: 'Hà Nội' })]);
    expect(tuyen.size).toBe(2);
  });

  /**
   * Trung (tuyen, dich vu con) thi dong DUOI de dong tren — trong mot file,
   * trung gan nhu luon la nguoi ta sua lai o dong duoi roi quen xoa dong tren.
   * Dem so lan de len de bao ra, khong nuot im lang.
   */
  it('trung khoi thi dong duoi de len va duoc dem', () => {
    const { tuyen, deLen } = gomTheoTuyen([
      dong(),
      dong({ dong: 3, gia: [{ unitCode: 'TRUCK_1T4', oneWayPrice: 9, roundTripPrice: null }] }),
    ]);
    expect(deLen).toBe(1);
    const dv = [...[...tuyen.values()][0]!.dichVu.values()][0]!;
    expect(dv.gia[0]!.oneWayPrice).toBe(9);
  });

  /**
   * Km thuoc TUYEN. Dong dau co khai thi giu con so do; dong sau bo trong
   * khong duoc xoa mat no.
   */
  it('km lay theo dong dau co khai', () => {
    const { tuyen } = gomTheoTuyen([
      dong({ roundTripKm: null }),
      dong({ dong: 3, roundTripKm: 620, kindRaw: 'LCL', kind: 'LCL' }),
    ]);
    expect([...tuyen.values()][0]!.roundTripKm).toBe(620);
  });
});

/**
 * Gia HAI CHIEU = gia mot chieu + 50%. Bang gia giay cua Bee ghi mot con so
 * moi loai xe va do la cuoc mot chieu; chieu ve tinh them nua gia.
 */
describe('gia hai chieu suy ra tu gia mot chieu', () => {
  it.each([
    [2000000, 3000000],
    [1250000, 1875000],
    [9500000, 14250000],
  ])('%s -> %s', (mot, hai) => {
    expect(giaHaiChieu(mot)).toBe(hai);
  });

  /** VND khong co so le: lam tron ve so nguyen, khong de ra .5 dong. */
  it('lam tron ve so nguyen', () => {
    expect(giaHaiChieu(1111111)).toBe(1666667);
    expect(Number.isInteger(giaHaiChieu(333333))).toBe(true);
  });
});

describe('coChieuVe', () => {
  it('cuoc chanh theo khoi / tan / pallet khong co chieu ve', () => {
    for (const ma of ['CBM', 'TON', 'PALLET_H19', 'PALLET_STACK_LT500']) expect(coChieuVe(ma)).toBe(false);
    for (const ma of ['5T_BAT', '20DC', 'TONG_HOP']) expect(coChieuVe(ma)).toBe(true);
  });
});
