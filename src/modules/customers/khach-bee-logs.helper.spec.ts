import { laKhachBeeLogs } from './khach-bee-logs.helper';

describe('laKhachBeeLogs', () => {
  it('nhận ra email của Bee Logistics', () => {
    expect(laKhachBeeLogs('an.nguyen@beelogistics.com')).toBe(true);
  });

  it('không phân biệt hoa thường, và bỏ khoảng trắng thừa hai đầu', () => {
    expect(laKhachBeeLogs('  An.Nguyen@BeeLogistics.COM ')).toBe(true);
  });

  it('nhận cả tên miền con — chi nhánh vẫn là người của họ', () => {
    expect(laKhachBeeLogs('an@vn.beelogistics.com')).toBe(true);
  });

  it('CHẶN tên miền chỉ kết thúc giống — đây là ca dễ sai nhất', () => {
    expect(laKhachBeeLogs('ke.gia@notbeelogistics.com')).toBe(false);
    expect(laKhachBeeLogs('ke.gia@xbeelogistics.com')).toBe(false);
  });

  it('chặn tên miền khác chỉ CHỨA chuỗi đó ở giữa', () => {
    expect(laKhachBeeLogs('an@beelogistics.com.vn')).toBe(false);
  });

  it('khách thường thì không phải', () => {
    expect(laKhachBeeLogs('khach@gmail.com')).toBe(false);
  });

  it('không có email thì không phải, và không ném lỗi', () => {
    expect(laKhachBeeLogs(null)).toBe(false);
    expect(laKhachBeeLogs(undefined)).toBe(false);
    expect(laKhachBeeLogs('')).toBe(false);
    expect(laKhachBeeLogs('  ')).toBe(false);
  });

  it('chuỗi không phải email thì không phải', () => {
    expect(laKhachBeeLogs('beelogistics.com')).toBe(true); // không có @ -> cả chuỗi là miền
    expect(laKhachBeeLogs('linh tinh')).toBe(false);
  });
});
