import {
  diaChiTuGhiChu, dungPayloadCustomer, thieuGiDeDongBo, type KhachDeDay,
} from './customer-payload.helper';

const DU: KhachDeDay = {
  code: 'CL000123',
  companyName: 'CÔNG TY TNHH KINGFA VIỆT NAM',
  contactName: 'KINGFA',
  email: 'ops@kingfa.example',
  taxCode: '0312345678',
  note: null,
  status: 'approved',
};

const truong = (k: KhachDeDay): string[] => thieuGiDeDongBo(k).map((t) => t.truong);

describe('thieuGiDeDongBo', () => {
  it('ho so du thi khong thieu gi', () => {
    expect(thieuGiDeDongBo(DU)).toEqual([]);
  });

  it('thieu ma khach thi chan', () => {
    expect(truong({ ...DU, code: null })).toEqual(['customerCode']);
    expect(truong({ ...DU, code: '   ' })).toEqual(['customerCode']);
  });

  it('ten roi ve ten nguoi lien he khi khong co ten cong ty', () => {
    expect(thieuGiDeDongBo({ ...DU, companyName: null })).toEqual([]);
    expect(truong({ ...DU, companyName: null, contactName: null })).toEqual(['name']);
  });

  /**
   * Hồ sơ `pending` là hồ sơ chưa ai xác nhận, mà đẩy sang rồi thì không xoá
   * được — contract không có API xoá.
   */
  it('khach chua duyet thi KHONG day', () => {
    expect(truong({ ...DU, status: 'pending' })).toEqual(['status']);
    expect(truong({ ...DU, status: 'rejected' })).toEqual(['status']);
  });
});

/**
 * Lần nhập dữ liệu cũ nhét địa chỉ vào `note` theo khuôn cố định; 534/697 hồ
 * sơ có nó, mà contract lại có hẳn ô `address`.
 */
describe('diaChiTuGhiChu', () => {
  it('moi duoc dia chi tu khuon cua du lieu cu', () => {
    expect(diaChiTuGhiChu('Nhom: CARRIER\nDia chi: 152 Nguyen Luong Bang st'))
      .toBe('152 Nguyen Luong Bang st');
  });

  it('nhan ca dang co dau', () => {
    expect(diaChiTuGhiChu('Nhóm: X\nĐịa chỉ: 561A Điện Biên Phủ, Bình Thạnh'))
      .toBe('561A Điện Biên Phủ, Bình Thạnh');
  });

  /** Du lieu cu co dong ghi "Dia chi: ." — mot dau cham khong phai dia chi. */
  it('chuoi qua ngan hay khong co chu/so deu bi bo', () => {
    expect(diaChiTuGhiChu('Dia chi: .')).toBeUndefined();
    expect(diaChiTuGhiChu('Dia chi: --')).toBeUndefined();
    expect(diaChiTuGhiChu('Dia chi: 12 Le Loi')).toBe('12 Le Loi');
  });

  it('khong co thi tra undefined, khong tra chuoi rong', () => {
    expect(diaChiTuGhiChu('Nhom: CARRIER')).toBeUndefined();
    expect(diaChiTuGhiChu('Dia chi:   ')).toBeUndefined();
    expect(diaChiTuGhiChu(null)).toBeUndefined();
  });
});

describe('dungPayloadCustomer', () => {
  it('dung day du cac o co that', () => {
    expect(dungPayloadCustomer({ ...DU, note: 'Nhom: CARRIER\nDia chi: 12 Lê Lợi' })).toEqual({
      address: '12 Lê Lợi',
      note: 'Nhom: CARRIER\nDia chi: 12 Lê Lợi',
      customerCode: 'CL000123',
      name: 'CÔNG TY TNHH KINGFA VIỆT NAM',
      shortName: 'KINGFA',
      taxCode: '0312345678',
      emails: ['ops@kingfa.example'],
    });
  });

  /** Ghi chú giữ NGUYÊN: nó còn mang "Nhom: CARRIER", thứ không có ô nào khác đựng. */
  it('chep dia chi ra nhung van giu nguyen ghi chu', () => {
    const p = dungPayloadCustomer({ ...DU, note: 'Nhom: CARRIER\nDia chi: 12 Lê Lợi' });
    expect(p.address).toBe('12 Lê Lợi');
    expect(p.note).toContain('Nhom: CARRIER');
  });

  /** Contract: trống thì OF1 tự dùng `name`, nên gửi lại y hệt là thêm một bản sao. */
  it('ten ngan trung ten day du thi BO HAN', () => {
    const p = dungPayloadCustomer({ ...DU, contactName: DU.companyName });
    expect(p).not.toHaveProperty('shortName');
  });

  it('o trong thi BO HAN, khong gui null', () => {
    const p = dungPayloadCustomer({
      ...DU, contactName: null, email: null, taxCode: null, note: null,
    });
    expect(p).toEqual({ customerCode: 'CL000123', name: 'CÔNG TY TNHH KINGFA VIỆT NAM' });
  });

  /**
   * BeeOps không có trường địa chỉ trên hồ sơ khách — địa chỉ nằm trên TỪNG
   * đơn dưới dạng chữ tự do. Bịa `addressCode` từ chuỗi đó là tạo một danh mục
   * không chỗ nào quản lý.
   */
  it('KHONG gui addresses', () => {
    expect(dungPayloadCustomer(DU)).not.toHaveProperty('addresses');
  });

  it('NEM LOI neu goi khi ho so con thieu', () => {
    expect(() => dungPayloadCustomer({ ...DU, code: null })).toThrow(/thiếu/i);
  });
});

describe('dia chi cua khach (070)', () => {
  const A = { code: 'A01', address: 'KCN Que Vo, Bac Ninh', contact: null, type: 'BOTH', isActive: true };

  it('gui kem danh muc dia chi', () => {
    const p = dungPayloadCustomer({ ...DU, addresses: [A] });
    expect(p.addresses).toEqual([
      { addressCode: 'A01', address: 'KCN Que Vo, Bac Ninh', type: 'BOTH' },
    ]);
  });

  it('nguoi lien he chi gui khi co', () => {
    const p = dungPayloadCustomer({ ...DU, addresses: [{ ...A, contact: 'Mr A_0901234567' }] });
    expect(p.addresses?.[0]!.contact).toBe('Mr A_0901234567');
  });

  /** Tat o BeeOps roi van gui sang la noi voi OF1 rang no con dung duoc. */
  it('dia chi da tat thi KHONG gui', () => {
    const p = dungPayloadCustomer({ ...DU, addresses: [{ ...A, isActive: false }] });
    expect(p).not.toHaveProperty('addresses');
  });

  it('loai la roi ve BOTH', () => {
    const p = dungPayloadCustomer({ ...DU, addresses: [{ ...A, type: 'LA' }] });
    expect(p.addresses?.[0]!.type).toBe('BOTH');
  });

  it('khach chua co dia chi nao thi BO HAN khoa', () => {
    expect(dungPayloadCustomer(DU)).not.toHaveProperty('addresses');
  });
});
