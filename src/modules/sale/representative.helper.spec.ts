import { oChuoiGhiDe } from './representative.helper';

/**
 * Ba trang thai chu khong hai: KHONG GUI, gui chuoi rong, va gui mot gia tri.
 * Gop "khong gui" vao "rong" la loi kinh dien cua PATCH — luu mo ta ma vo tinh
 * xoa luon anh la kieu hong khong ai ngo toi.
 */
describe('o chuoi ghi de cho PATCH nguoi dai dien', () => {
  it('khong gui thi giu nguyen', () => {
    expect(oChuoiGhiDe(undefined)).toBeUndefined();
  });

  it('gui chuoi rong la XOA, luu null', () => {
    expect(oChuoiGhiDe('')).toBeNull();
    expect(oChuoiGhiDe('   ')).toBeNull();
  });

  it('gui gia tri thi luu ban da cat khoang trang', () => {
    expect(oChuoiGhiDe('  https://a/b.png  ')).toBe('https://a/b.png');
  });
});
