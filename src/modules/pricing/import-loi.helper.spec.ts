import { loiNhapBangGia } from './import-loi.helper';

describe('cau bao loi khi nhap bang gia hong het', () => {
  /**
   * Danh muc rong thi moi dong deu truot, va cau bao cu — `khong co dia diem
   * "da nang"` — doc nhu "ban go sai ten". Nguoi dung he thong lan dau se ngoi
   * sua chinh ta trong file, mai khong ra, trong khi viec phai lam la di tao
   * danh muc.
   */
  it('danh muc dia diem rong thi chi ve dung viec phai lam', () => {
    const msg = loiNhapBangGia({
      boQua: ['Dòng 2: không có địa điểm "đà nẵng"'],
      soDiaDiem: 0,
      soDonVi: 9,
    });
    expect(msg).toContain('Địa điểm');
    expect(msg).not.toContain('đà nẵng');
  });

  /** Danh muc rong noi TRUOC moi ly do khac: cac loi kia chi la he qua. */
  it('dia diem rong thang the cho ly do cua tung dong', () => {
    const msg = loiNhapBangGia({
      boQua: ['Dòng 2: giá không đọc được'],
      soDiaDiem: 0,
      soDonVi: 0,
    });
    expect(msg).toContain('Địa điểm');
  });

  it('chua co don vi tinh nao thi noi rieng', () => {
    const msg = loiNhapBangGia({ boQua: [], soDiaDiem: 3, soDonVi: 0 });
    expect(msg).toContain('đơn vị tính');
  });

  it('khong co dong nao trong file', () => {
    expect(loiNhapBangGia({ boQua: [], soDiaDiem: 3, soDonVi: 9 }))
      .toBe('File không có dòng dữ liệu nào');
  });

  it('mot dong hong thi in nguyen ly do, khong dem', () => {
    expect(loiNhapBangGia({ boQua: ['Dòng 2: giá không đọc được'], soDiaDiem: 3, soDonVi: 9 }))
      .toBe('Không dòng nào dùng được. Dòng 2: giá không đọc được');
  });

  /**
   * Mot dong hong khac han ca tram dong hong: nguoi doc can biet minh dang sua
   * mot loi go hay sai ca file.
   */
  it('nhieu dong hong thi noi ro bao nhieu dong', () => {
    const msg = loiNhapBangGia({
      boQua: ['Dòng 2: giá không đọc được', 'Dòng 3: giá không đọc được'],
      soDiaDiem: 3,
      soDonVi: 9,
    });
    expect(msg).toContain('2 dòng bị bỏ');
    expect(msg).toContain('Dòng 2');
  });
});
