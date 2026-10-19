import { chuanHoaSlug, khoaTuTen, maTuTen } from './landing-service.helper';

describe('slug cho dich vu tren landing', () => {
  /** Duong dan phai doc duoc va go duoc: bo dau, thay khoang trang bang gach. */
  it('bo dau tieng Viet va ghep bang gach ngang', () => {
    expect(chuanHoaSlug('Vận chuyển hàng lạnh')).toBe('van-chuyen-hang-lanh');
    expect(chuanHoaSlug('Đóng kiện & đóng gói')).toBe('dong-kien-dong-goi');
  });

  /** Chu D gach ngang khong nam trong bang dau, phai xu ly rieng. */
  it('doi D gach ngang thanh d', () => {
    expect(chuanHoaSlug('Đường sắt')).toBe('duong-sat');
  });

  it('khong de lai gach thua o hai dau hay gach doi o giua', () => {
    expect(chuanHoaSlug('  Kho --- bai  ')).toBe('kho-bai');
  });

  /** Ten toan ky tu la thi khong bia ra duong dan — de nguoi dung tu dat. */
  it('ten khong con chu nao thi tra chuoi rong', () => {
    expect(chuanHoaSlug('!!! ???')).toBe('');
  });
});

describe('khoa on dinh cho dich vu tren landing', () => {
  /**
   * Khoa phai la mot dinh danh, khong phai duong dan: no di vao khoa o noi
   * dung (services.items.<khoa>.name) nen khong duoc chua dau cham hay gach
   * ngang — cham la dau tach cap trong khoa noi dung.
   */
  it('sinh khoa kieu dinh danh, co tien to de khong dung chin khoa cu', () => {
    expect(khoaTuTen('Vận chuyển hàng lạnh')).toBe('them_van_chuyen_hang_lanh');
  });

  it('ten rong thi khong sinh khoa', () => {
    expect(khoaTuTen('   ')).toBeNull();
  });
});

describe('ma 3 chu cho dich vu moi', () => {
  it('lay chu cai dau cua ba tu dau', () => {
    expect(maTuTen('Vận chuyển hàng lạnh', new Set())).toBe('VCH');
  });

  /** Ten mot tu thi lay ba chu cai dau cua chinh no. */
  it('ten mot tu thi lay ba chu dau', () => {
    expect(maTuTen('Logistics', new Set())).toBe('LOG');
  });

  /** Ma da co roi thi phai tim ma khac — ma la khoa duy nhat va la tien to ma don. */
  it('ne ma da ton tai', () => {
    expect(maTuTen('Vận chuyển hàng lạnh', new Set(['VCH', 'VCH1']))).not.toBe('VCH');
    expect(maTuTen('Vận chuyển hàng lạnh', new Set(['VCH']))).toMatch(/^[A-Z]{3}$/);
  });

  it('ten khong co chu cai nao thi khong doan ma', () => {
    expect(maTuTen('!!!', new Set())).toBeNull();
  });
});
