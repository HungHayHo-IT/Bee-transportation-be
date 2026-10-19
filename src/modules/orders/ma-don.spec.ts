import { tienToCuaDon, tienToMaDon, vietTatTms } from './ma-don.helper';

/** Đúng mười tám mã trong CHECK của service_children (migration 040). */
const TAT_CA_MA = [
  'EXPORT_FCL', 'EXPORT_FCL_RU', 'EXPORT_LCL', 'EXPORT_AIR', 'EXPORT_BULK_CARGO',
  'IMPORT_FCL', 'IMPORT_FCL_RU', 'IMPORT_LCL', 'IMPORT_AIR', 'IMPORT_BULK_CARGO',
  'DOMESTIC', 'DOMESTIC_FCL', 'DOMESTIC_LCL',
  'CBT', 'CBT_FCL', 'CBT_LCL',
  'PORTTRANSFER_FCL', 'PORTTRANSFER_LCL',
];

describe('vietTatTms', () => {
  it.each([
    ['EXPORT_FCL', 'E_FCL'],
    ['EXPORT_FCL_RU', 'E_FCL_RU'],
    ['EXPORT_BULK_CARGO', 'E_BULK_CARGO'],
    ['IMPORT_LCL', 'I_LCL'],
    ['DOMESTIC_FCL', 'D_FCL'],
    ['CBT_FCL', 'C_FCL'],
    ['PORTTRANSFER_LCL', 'P_LCL'],
  ])('%s -> %s', (ma, mong) => expect(vietTatTms(ma)).toBe(mong));

  it('mã không có gạch dưới rút về đúng một chữ cái', () => {
    expect(vietTatTms('DOMESTIC')).toBe('D');
    expect(vietTatTms('CBT')).toBe('C');
  });

  // Hai ma TMS cho ra cung mot tien to la hai loai don dung chung day so thu
  // tu trong ngay — nhin ma khong con biet don thuoc loai nao.
  it('KHÔNG có hai mã nào viết tắt trùng nhau', () => {
    const tat = TAT_CA_MA.map(vietTatTms);
    expect(new Set(tat).size).toBe(TAT_CA_MA.length);
  });
});

describe('tienToMaDon', () => {
  it('đơn có mã TMS dùng viết tắt và dấu gạch dưới', () => {
    expect(tienToMaDon('MMT', 'EXPORT_FCL')).toEqual({ tienTo: 'E_FCL', ngan: '_' });
  });

  // Tam trong muoi mot dich vu khong co ma TMS. Doi ma cua chung la lam vo
  // nhung ma don da in tren hop dong.
  it('đơn KHÔNG có mã TMS giữ nguyên mã dịch vụ cha và dấu gạch ngang', () => {
    expect(tienToMaDon('BRK', null)).toEqual({ tienTo: 'BRK', ngan: '-' });
  });
});

describe('tienToCuaDon', () => {
  const MMT = { code: 'MMT' };
  const con = [{ id: 7, tmsMode: 'EXPORT_FCL' }, { id: 8, tmsMode: null }];

  it('lấy mã của dịch vụ con khi có chọn', () => {
    expect(tienToCuaDon(MMT, con, 7)).toEqual({ tienTo: 'E_FCL', ngan: '_' });
  });

  // Tu 049 ma TMS CHI nam o dich vu con. Dich vu khong chia nho giu ma kieu cu.
  it('dịch vụ không có dịch vụ con nào thì giữ kiểu cũ', () => {
    expect(tienToCuaDon({ code: 'BRK' }, [], undefined))
      .toEqual({ tienTo: 'BRK', ngan: '-' });
  });

  it('dịch vụ con không mang mã thì cũng giữ kiểu cũ', () => {
    expect(tienToCuaDon({ code: 'DOM' }, con, 8))
      .toEqual({ tienTo: 'DOM', ngan: '-' });
  });

  it('không chọn dịch vụ con thì giữ kiểu cũ', () => {
    expect(tienToCuaDon({ code: 'MMT' }, con, undefined))
      .toEqual({ tienTo: 'MMT', ngan: '-' });
  });
});
