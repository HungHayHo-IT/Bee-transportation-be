import { normalizeProvince, PROVINCES } from './provinces';

describe('normalizeProvince (QA-02)', () => {
  it('nhận đúng cả 34 tên chuẩn', () => {
    for (const p of PROVINCES) expect(normalizeProvince(p)).toBe(p);
  });

  it('quy các viết tắt đã lẫn trong DB về tên chuẩn', () => {
    expect(normalizeProvince('HN')).toBe('Hà Nội');
    expect(normalizeProvince('HP')).toBe('Hải Phòng');
    expect(normalizeProvince('TPHCM')).toBe('TP. Hồ Chí Minh');
  });

  it('bỏ qua dấu, hoa thường và khoảng trắng thừa', () => {
    expect(normalizeProvince(' hà nội ')).toBe('Hà Nội');
    expect(normalizeProvince('HÀ NỘI')).toBe('Hà Nội');
    expect(normalizeProvince('dak lak')).toBe('Đắk Lắk');
  });

  /**
   * Tên TRƯỚC sáp nhập 2025. Bảng giá, hợp đồng và file khách gửi còn dùng
   * những tên này rất lâu nữa; không nhận ra là rơi xuống null, tức là mất
   * luôn tỉnh của dòng đó.
   */
  it('tên tỉnh cũ quy về đơn vị đã nhận sáp nhập', () => {
    expect(normalizeProvince('Quảng Nam')).toBe('Đà Nẵng');
    expect(normalizeProvince('QUẢNG BÌNH')).toBe('Quảng Trị');
    expect(normalizeProvince('Bình Định')).toBe('Gia Lai');
    expect(normalizeProvince('Quy Nhơn')).toBe('Gia Lai');
    expect(normalizeProvince('KonTum')).toBe('Quảng Ngãi');
    expect(normalizeProvince('Thừa Thiên Huế')).toBe('Huế');
  });

  /** Mọi tên trong bảng giá miền Trung phải ra một tỉnh có thật. */
  it('không tên nào trong bảng giá miền Trung rơi xuống null', () => {
    const trongFile = ['ĐÀ NẴNG', 'QUẢNG NAM', 'HUẾ', 'QUẢNG TRỊ', 'QUẢNG NGÃI',
      'QUY NHƠN', 'QUẢNG BÌNH', 'KONTUM', 'GIA LAI', 'KHÁNH HÒA', 'DAK LAK',
      'TÂY NINH', 'THỪA THIÊN HUẾ', 'BÌNH ĐỊNH'];
    for (const t of trongFile) expect(normalizeProvince(t)).not.toBeNull();
  });

  /**
   * Chốt cả 29 tên bị xoá sổ sau sáp nhập, không chỉ vài cái tiện tay. File
   * khách gửi dùng tên nào là chuyện của họ; thiếu một lối về là cả dòng bảng
   * giá bị từ chối, và lỗi hiện ra là "tỉnh không có thật" chứ không ai đoán
   * được nguyên nhân là bảng này.
   */
  it('mọi tỉnh đã bị xoá sổ đều có lối về', () => {
    const daXoa: Record<string, string> = {
      'Bắc Kạn': 'Thái Nguyên', 'Hà Giang': 'Tuyên Quang', 'Yên Bái': 'Lào Cai',
      'Bắc Giang': 'Bắc Ninh', 'Hải Dương': 'Hải Phòng', 'Thái Bình': 'Hưng Yên',
      'Hà Nam': 'Ninh Bình', 'Nam Định': 'Ninh Bình', 'Vĩnh Phúc': 'Phú Thọ',
      'Hoà Bình': 'Phú Thọ', 'Hòa Bình': 'Phú Thọ', 'Quảng Nam': 'Đà Nẵng',
      'Quảng Bình': 'Quảng Trị', 'Bình Định': 'Gia Lai', 'Kon Tum': 'Quảng Ngãi',
      'Phú Yên': 'Đắk Lắk', 'Ninh Thuận': 'Khánh Hòa', 'Bình Thuận': 'Lâm Đồng',
      'Đắk Nông': 'Lâm Đồng', 'Bình Phước': 'Đồng Nai',
      'Bình Dương': 'TP. Hồ Chí Minh', 'Bà Rịa - Vũng Tàu': 'TP. Hồ Chí Minh',
      'Long An': 'Tây Ninh', 'Tiền Giang': 'Đồng Tháp', 'Bến Tre': 'Vĩnh Long',
      'Trà Vinh': 'Vĩnh Long', 'Sóc Trăng': 'Cần Thơ', 'Hậu Giang': 'Cần Thơ',
      'Bạc Liêu': 'Cà Mau', 'Kiên Giang': 'An Giang',
      'Thừa Thiên Huế': 'Huế',
    };
    for (const [cu, moi] of Object.entries(daXoa)) {
      expect(normalizeProvince(cu)).toBe(moi);
      expect(normalizeProvince(cu.toUpperCase())).toBe(moi);
    }
  });

  it('phân biệt "không điền" với "điền sai"', () => {
    // undefined -> giữ nguyên cột, null -> xóa về null, còn sai hẳn cũng là null
    // nhưng bên gọi phân biệt được nhờ chuỗi gốc khác rỗng.
    expect(normalizeProvince(undefined)).toBeUndefined();
    expect(normalizeProvince('   ')).toBeNull();
    expect(normalizeProvince('Xứ Mộng Mơ')).toBeNull();
  });

  /**
   * OF1 goi tinh kem tien to hanh chinh. Thieu buoc cat tien to thi 20/42 dia
   * diem da co ma OF1 bi cham la lech tinh, va luat tie-break theo tinh cua bo
   * khop kho/cang khong bao gio chay.
   */
  it('nhan ca tien to hanh chinh cua OF1', () => {
    expect(normalizeProvince('Thành phố Đà Nẵng')).toBe('Đà Nẵng');
    expect(normalizeProvince('Tỉnh Thừa Thiên Huế')).toBe('Huế');
    expect(normalizeProvince('Tỉnh Quảng Trị')).toBe('Quảng Trị');
    expect(normalizeProvince('TP. Hồ Chí Minh')).toBe('TP. Hồ Chí Minh');
  });

  it('van tra null voi chuoi khong phai tinh', () => {
    expect(normalizeProvince('Tỉnh Không Có Thật')).toBeNull();
  });
});
