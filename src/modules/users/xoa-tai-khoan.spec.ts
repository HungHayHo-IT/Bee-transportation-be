import { canXoaDuoc } from './xoa-tai-khoan.helper';

const CO_BAN = {
  vaiCuaNguoiBiXoa: ['sale'],
  idNguoiBiXoa: 12,
  idNguoiXoa: 1,
  phaiChuyen: { don: 0, phieuKy: 0 },
  idNhanLaiDon: undefined,
};

describe('canXoaDuoc', () => {
  it('tài khoản sạch, vai thường thì xoá được', () => {
    expect(canXoaDuoc(CO_BAN)).toBeNull();
  });

  // Ba vai dieu hanh: xoa nham la mat duong vao he thong hoac mat nguoi duyet
  // cua ca mot phong.
  it.each(['admin', 'leader', 'manager'])('vai %s thì KHÔNG xoá được', (vai) => {
    expect(canXoaDuoc({ ...CO_BAN, vaiCuaNguoiBiXoa: [vai] }))
      .toMatch(/không xoá được/);
  });

  it('kiêm thêm một vai bị chặn thì vẫn bị chặn', () => {
    expect(canXoaDuoc({ ...CO_BAN, vaiCuaNguoiBiXoa: ['sale', 'manager'] }))
      .toMatch(/manager/);
  });

  it('vai Pricing xoá được', () => {
    expect(canXoaDuoc({ ...CO_BAN, vaiCuaNguoiBiXoa: ['staff'] })).toBeNull();
  });

  /* Nguoi goi dang cam token cua chinh tai khoan sap bien mat. Chan o day chu
     khong de ho tu phat hien sau khi moi request deu 401. */
  it('KHÔNG tự xoá tài khoản của mình', () => {
    expect(canXoaDuoc({ ...CO_BAN, idNguoiXoa: 12 }))
      .toBe('Không tự xoá tài khoản của mình được');
  });

  it('tự xoá mình bị chặn TRƯỚC cả việc xét vai', () => {
    expect(canXoaDuoc({ ...CO_BAN, idNguoiXoa: 12, vaiCuaNguoiBiXoa: ['admin'] }))
      .toBe('Không tự xoá tài khoản của mình được');
  });
});

/* Don va phieu ky giu nguoi tao o cot NOT NULL nen khong bo trong duoc. Phieu
   ky con la chung cu cua hop dong khach da ky - chuyen nguoi chu khong xoa. */
describe('canXoaDuoc — đơn và phiếu ký phải có người nhận lại', () => {
  it('đang đứng tên đơn mà chưa chọn người nhận thì bị chặn, và câu lỗi nói rõ số lượng', () => {
    const loi = canXoaDuoc({ ...CO_BAN, phaiChuyen: { don: 8, phieuKy: 0 } });
    expect(loi).toMatch(/8 đơn/);
    expect(loi).toMatch(/chuyenDonCho/);
  });

  it('câu lỗi gộp cả đơn lẫn phiếu ký', () => {
    const loi = canXoaDuoc({ ...CO_BAN, phaiChuyen: { don: 8, phieuKy: 3 } });
    expect(loi).toMatch(/8 đơn và 3 phiếu ký/);
  });

  it('chỉ có phiếu ký thì câu lỗi KHÔNG nhắc tới đơn', () => {
    const loi = canXoaDuoc({ ...CO_BAN, phaiChuyen: { don: 0, phieuKy: 2 } });
    expect(loi).toMatch(/2 phiếu ký/);
    expect(loi).not.toMatch(/đơn/);
  });

  it('chọn người nhận rồi thì xoá được', () => {
    expect(canXoaDuoc({
      ...CO_BAN, phaiChuyen: { don: 8, phieuKy: 3 }, idNhanLaiDon: 5,
    })).toBeNull();
  });

  it('người nhận lại KHÔNG được là chính tài khoản đang bị xoá', () => {
    expect(canXoaDuoc({
      ...CO_BAN, phaiChuyen: { don: 1, phieuKy: 0 }, idNhanLaiDon: 12,
    })).toMatch(/không thể là chính tài khoản/);
  });

  // Khong co don nao thi khong hoi nguoi nhan - mot o bat buoc khong can thiet
  // la mot buoc thua moi lan xoa.
  it('tài khoản sạch thì KHÔNG đòi người nhận lại', () => {
    expect(canXoaDuoc({ ...CO_BAN, phaiChuyen: { don: 0, phieuKy: 0 } })).toBeNull();
  });
});
