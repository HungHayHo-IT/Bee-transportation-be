import { khopKhoCang, khoa, khoaGon, type DiaDiemCanKhop } from './khop-kho-cang.helper';
import type { KhoCangOf1 } from './of1.client';

const kho = (
  locationId: number, label: string, stateLabel: string | null = null,
  shortLabel: string | null = null, code: string | null = null,
): KhoCangOf1 => ({
  locationId, label, shortLabel, code, stateLabel, locationType: 'Port', address: null,
});

const dd = (id: number, name: string, province: string | null = null): DiaDiemCanKhop =>
  ({ id, name, province });

describe('khoa / khoaGon', () => {
  it('bo dau va moi ky tu la', () => {
    expect(khoa('CẢNG ĐÀ NẴNG')).toBe('cangdanang');
    expect(khoa("Cang Da Nang")).toBe('cangdanang');
  });

  /** "CẢNG ĐÀ NẴNG" và "Da Nang Port" là MỘT chỗ. */
  it('bo nhung chu chung chung', () => {
    expect(khoaGon('CẢNG ĐÀ NẴNG')).toBe(khoaGon('Da Nang Port'));
    expect(khoaGon('KCN Đình Vũ')).toBe(khoaGon('Dinh Vu Industrial Zone'));
  });
});

describe('khopKhoCang', () => {
  it('khop duoc du viet hoa, viet thuong hay co dau', () => {
    const ra = khopKhoCang([dd(1, 'Cảng Đà Nẵng')], [kho(500, 'CANG DA NANG')]);
    expect(ra.khop).toEqual([
      { diaDiemId: 1, locationId: 500, ten: 'Cảng Đà Nẵng', theo: 'tên' },
    ]);
    expect(ra.nhapNhang).toEqual([]);
    expect(ra.khongThay).toEqual([]);
  });

  it('khop qua ten rut gon khi hai ben goi khac kieu', () => {
    const ra = khopKhoCang([dd(1, 'KCN Đình Vũ')], [kho(501, 'Dinh Vu Industrial Zone')]);
    expect(ra.khop[0]!.locationId).toBe(501);
  });

  it('khop qua ma hoac ten ngan', () => {
    const ra = khopKhoCang(
      [dd(1, 'HICT'), dd(2, 'HPH-LH')],
      [kho(502, 'Cang Lach Huyen HICT', null, 'HICT', 'HPH-LH')],
    );
    expect(ra.khop.map((x) => x.locationId)).toEqual([502, 502]);
  });

  /**
   * Trúng hai cách gọi của CÙNG một cảng không phải nhập nhằng — đếm theo
   * locationId chứ không theo số lần trúng chỉ mục.
   */
  it('trung nhieu cach goi cua cung mot cang van la khop chac chan', () => {
    const ra = khopKhoCang([dd(1, 'Cang Da Nang')], [kho(503, 'Cang Da Nang', null, 'Cang Da Nang')]);
    expect(ra.khop).toHaveLength(1);
    expect(ra.nhapNhang).toEqual([]);
  });

  /** Hai cảng trùng tên ở hai tỉnh là chuyện thường, mà tỉnh thì ta biết chắc. */
  it('hai ung vien trung ten thi loc them bang tinh', () => {
    const ra = khopKhoCang(
      [dd(1, 'Cảng Cửa Lò', 'Nghệ An')],
      [kho(504, 'Cang Cua Lo', 'Nghe An'), kho(505, 'Cang Cua Lo', 'Da Nang')],
    );
    expect(ra.khop).toEqual([
      { diaDiemId: 1, locationId: 504, ten: 'Cảng Cửa Lò', theo: 'tên + tỉnh' },
    ]);
  });

  /**
   * KHÔNG đoán khi còn hai ứng viên: khớp nhầm là đơn đi tới một cảng khác mà
   * không ai thấy. Trả ra để người nhìn.
   */
  it('con hai ung vien thi de nguoi chon, khong doan', () => {
    const ra = khopKhoCang(
      [dd(1, 'Cảng Cửa Lò')],
      [kho(504, 'Cang Cua Lo', 'Nghe An'), kho(505, 'Cang Cua Lo', 'Da Nang')],
    );
    expect(ra.khop).toEqual([]);
    expect(ra.nhapNhang).toHaveLength(1);
    expect(ra.nhapNhang[0]!.ungVien).toHaveLength(2);
  });

  it('khong co ung vien nao thi bao khong thay', () => {
    const ra = khopKhoCang([dd(9, 'Kho Nhà Mình')], [kho(506, 'Cang Hai Phong')]);
    expect(ra.khongThay).toEqual([{ diaDiemId: 9, ten: 'Kho Nhà Mình' }]);
  });

  /** Tên tỉnh CŨ của OF1 vẫn phải quy về đúng đơn vị sau sáp nhập. */
  it('ten tinh cu ben OF1 van loc dung', () => {
    const ra = khopKhoCang(
      [dd(1, 'KCN Quế Võ', 'Bắc Ninh')],
      [kho(507, 'KCN Que Vo', 'Bac Giang'), kho(508, 'KCN Que Vo', 'Hai Duong')],
    );
    // Bac Giang da nhap vao Bac Ninh; Hai Duong vao Hai Phong.
    expect(ra.khop[0]!.locationId).toBe(507);
  });

  /**
   * Luat chat phai thang luat long. "CANG DA NANG" khop dung MOT dong theo ten
   * day du, nhung ten rut gon bo chu "cang" con "danang" — trung them "Kho Da
   * Nang" va "San Bay Da Nang". Gop ca hai vao mot ro thi ham tu choi doan, va
   * mot khop chac chan bi vut di. Gap that tren production: 53006.
   */
  it('ten day du trung thi KHONG xet ten rut gon nua', () => {
    const r = khopKhoCang(
      [{ id: 156, name: 'CẢNG ĐÀ NẴNG', province: 'Đà Nẵng' }],
      [
        { locationId: 53006, label: 'Cảng Đà Nẵng', stateLabel: 'Thành phố Đà Nẵng' },
        { locationId: 42715, label: 'Kho Đà Nẵng', stateLabel: 'Thành phố Đà Nẵng' },
        { locationId: 53033, label: 'Sân Bay Đà Nẵng', stateLabel: 'Thành phố Đà Nẵng' },
      ] as never,
    );
    expect(r.khop).toEqual([
      { diaDiemId: 156, locationId: 53006, ten: 'CẢNG ĐÀ NẴNG', theo: 'tên' },
    ]);
    expect(r.nhapNhang).toEqual([]);
  });
});
