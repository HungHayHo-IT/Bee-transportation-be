import { classifyServiceCode } from './service-code.helper';
import { unknownServiceCodeMessage } from './quote-request-notify.helper';

describe('classifyServiceCode — phân loại mã dịch vụ gửi từ form công khai', () => {
  it('mã khớp dịch vụ đang bật thì trả serviceId, không có vấn đề gì', () => {
    const r = classifyServiceCode('DOM', { id: 3, isActive: true });
    expect(r.serviceId).toBe(3);
    expect(r.problem).toBeUndefined();
  });

  /**
   * Ca đã khiến phải lần ngược từ ảnh chụp màn hình mới ra nguyên nhân: bảng
   * ánh xạ bên landing page lệch một dòng thì mã gửi lên không khớp gì cả, mà
   * hệ thống xử lý y như khách không chọn dịch vụ.
   */
  it('mã không khớp dịch vụ nào thì báo not_found, không có serviceId', () => {
    const r = classifyServiceCode('XYZ', null);
    expect(r.serviceId).toBeUndefined();
    expect(r.problem).toEqual({ code: 'XYZ', reason: 'not_found' });
  });

  /** Dịch vụ ngừng bán khác hẳn mã gõ sai — người xử lý cần phân biệt được. */
  it('mã khớp nhưng dịch vụ đã tắt thì báo inactive', () => {
    const r = classifyServiceCode('BRK', { id: 9, isActive: false });
    expect(r.serviceId).toBeUndefined();
    expect(r.problem).toEqual({ code: 'BRK', reason: 'inactive' });
  });
});

describe('unknownServiceCodeMessage — nội dung báo cho nhân viên', () => {
  it('nói rõ mã nào không khớp, không nói chung chung "chưa có dịch vụ"', () => {
    const m = unknownServiceCodeMessage(7, ' Nguyễn Linh ', ' 0977856665 ', {
      code: 'XYZ', reason: 'not_found',
    });
    expect(m.title).toContain('#7');
    expect(m.body).toContain('XYZ');
    expect(m.body).toContain('Nguyễn Linh');
    expect(m.body).toContain('0977856665');
  });

  it('phân biệt được hai lý do trong nội dung', () => {
    const a = unknownServiceCodeMessage(1, 'A', '09', { code: 'XYZ', reason: 'not_found' });
    const b = unknownServiceCodeMessage(1, 'A', '09', { code: 'BRK', reason: 'inactive' });
    expect(a.body).not.toBe(b.body);
  });

  it('cắt khoảng trắng thừa như các bản tin khác', () => {
    const m = unknownServiceCodeMessage(7, '  Tên  ', '  090  ', {
      code: 'XYZ', reason: 'not_found',
    });
    expect(m.body).toContain('Tên — 090');
  });
});
