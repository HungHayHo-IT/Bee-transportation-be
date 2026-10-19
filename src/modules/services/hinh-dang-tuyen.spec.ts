import { TMS_MODES } from '@/common/reference/tms-modes';
import { hinhDangTuyen, tuMaTms } from './hinh-dang-tuyen.helper';

const CHA = { hasDomesticOrigin: true, hasDomesticDestination: true };

describe('hinhDangTuyen', () => {
  it('không chọn dịch vụ con thì theo dịch vụ cha', () => {
    expect(hinhDangTuyen(CHA, null)).toEqual({ diTrongNuoc: true, denTrongNuoc: true });
    expect(hinhDangTuyen({ hasDomesticOrigin: true, hasDomesticDestination: false }, undefined))
      .toEqual({ diTrongNuoc: true, denTrongNuoc: false });
  });

  // Day la cho sua loi trong anh: PRJ (cha: ca hai trong nuoc) chon "Xuyen bien
  // gioi nguyen container" thi KHONG duoc doi tinh/thanh Viet Nam cho diem den.
  it('dịch vụ con ĐÈ LÊN dịch vụ cha', () => {
    expect(hinhDangTuyen(CHA, { hasDomesticOrigin: true, hasDomesticDestination: false }))
      .toEqual({ diTrongNuoc: true, denTrongNuoc: false });
  });

  it('hàng nhập khẩu: điểm ĐI nằm ngoài nước', () => {
    expect(hinhDangTuyen(CHA, { hasDomesticOrigin: false, hasDomesticDestination: true }))
      .toEqual({ diTrongNuoc: false, denTrongNuoc: true });
  });

  // Mot dich vu con khai mot dau va bo trong dau kia la hop le - khong phai
  // "khai thi khai ca hai".
  it('từng cờ rơi về cha ĐỘC LẬP nhau', () => {
    expect(hinhDangTuyen(
      { hasDomesticOrigin: false, hasDomesticDestination: true },
      { hasDomesticOrigin: null, hasDomesticDestination: false },
    )).toEqual({ diTrongNuoc: false, denTrongNuoc: false });
  });

  it('false của dịch vụ con KHÔNG bị coi là "chưa khai"', () => {
    expect(hinhDangTuyen(CHA, { hasDomesticOrigin: false, hasDomesticDestination: false }))
      .toEqual({ diTrongNuoc: false, denTrongNuoc: false });
  });
});

describe('tuMaTms', () => {
  it.each([
    ['EXPORT_FCL', true, false],
    ['EXPORT_BULK_CARGO', true, false],
    ['IMPORT_LCL', false, true],
    ['IMPORT_AIR', false, true],
    ['CBT_FCL', true, false],
    ['DOMESTIC_LCL', true, true],
    ['PORTTRANSFER_FCL', true, true],
  ])('%s: đi %s, đến %s', (ma, di, den) => {
    expect(tuMaTms(ma)).toEqual({ diTrongNuoc: di, denTrongNuoc: den });
  });

  it('chưa gắn mã thì không suy ra được gì', () => {
    expect(tuMaTms(null)).toBeNull();
    expect(tuMaTms(undefined)).toBeNull();
  });

  /* Ma moi them vao danh sach ma quen them vao bang suy luan thi migration dien
     NULL cho no, va don cua no lang le roi ve co cua dich vu cha - sai mot chieu
     ma khong ai thay. */
  it('MỌI mã trong danh sách OF1 đều suy ra được', () => {
    const khongSuyDuoc = TMS_MODES.filter((m) => tuMaTms(m) === null);
    expect(khongSuyDuoc).toEqual([]);
  });
});
