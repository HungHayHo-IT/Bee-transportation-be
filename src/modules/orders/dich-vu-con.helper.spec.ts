import { kiemDichVuCon } from './dich-vu-con.helper';

const CON_CUA_DOM = [{ id: 10, serviceId: 3 }, { id: 11, serviceId: 3 }];

describe('kiemDichVuCon', () => {
  it('dịch vụ không có con nào thì bỏ trống là hợp lệ, kể cả khi bắt buộc', () => {
    expect(kiemDichVuCon(1, undefined, [], true)).toBeNull();
  });

  it('dịch vụ CÓ con mà bỏ trống lúc tạo đơn thì chặn', () => {
    expect(kiemDichVuCon(3, undefined, CON_CUA_DOM, true))
      .toBe('Dịch vụ này cần chọn thêm dịch vụ con');
  });

  it('lúc sửa đơn, bỏ trống nghĩa là không đụng tới — không chặn', () => {
    expect(kiemDichVuCon(3, undefined, CON_CUA_DOM, false)).toBeNull();
  });

  it('chọn đúng con của dịch vụ đó thì qua', () => {
    expect(kiemDichVuCon(3, 10, CON_CUA_DOM, true)).toBeNull();
  });

  it('chọn con của dịch vụ khác thì chặn', () => {
    expect(kiemDichVuCon(3, 99, CON_CUA_DOM, true))
      .toBe('Dịch vụ con không thuộc dịch vụ đã chọn, hoặc đã ngừng dùng');
  });

  it('con đã tắt không nằm trong danh sách truyền vào, nên cũng bị chặn', () => {
    // Người gọi chỉ đưa vào con đang bật — một id đã tắt rơi vào đúng nhánh này.
    expect(kiemDichVuCon(3, 12, CON_CUA_DOM, true)).not.toBeNull();
  });

  it('gửi dịch vụ con cho dịch vụ không có con nào thì nói rõ là không có', () => {
    expect(kiemDichVuCon(1, 10, [], true))
      .toBe('Dịch vụ này không có dịch vụ con nào đang dùng');
  });

  it('null xử lý giống bỏ trống, không rơi vào nhánh tra id', () => {
    expect(kiemDichVuCon(3, null, CON_CUA_DOM, false)).toBeNull();
    expect(kiemDichVuCon(3, null, CON_CUA_DOM, true))
      .toBe('Dịch vụ này cần chọn thêm dịch vụ con');
  });
});

describe('kiemDichVuCon — KHÔNG còn lối thoát bằng mã dịch vụ cha', () => {
  const CON_CUA_DOM = [{ id: 10, serviceId: 3 }, { id: 11, serviceId: 3 }];

  // Truoc 049, DOM mang san ma DOMESTIC nen bo trong dich vu con van hop le.
  // Loi do la AO: luc day don, payload chi doc ma cua dich vu CON, nen don di
  // qua loi ay sang OF1 khong mang mode nao ca.
  it('DOM có dịch vụ con thì vẫn bắt buộc chọn, không còn ngoại lệ nào', () => {
    expect(kiemDichVuCon(3, undefined, CON_CUA_DOM, true))
      .toBe('Dịch vụ này cần chọn thêm dịch vụ con');
  });

  it('chọn một dịch vụ con sai vẫn bị chặn', () => {
    expect(kiemDichVuCon(3, 99, CON_CUA_DOM, true))
      .toBe('Dịch vụ con không thuộc dịch vụ đã chọn, hoặc đã ngừng dùng');
  });

  // PATCH vang truong nghia la khong dung toi: don cu chua co dich vu con van
  // sua duoc thong tin khac.
  it('khi không bắt buộc (sửa đơn) thì bỏ trống vẫn hợp lệ', () => {
    expect(kiemDichVuCon(3, undefined, CON_CUA_DOM, false)).toBeNull();
  });
});
