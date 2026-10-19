import { docPhanHoiOf1 } from './of1.client';

describe('docPhanHoiOf1', () => {
  it('data.status = S là OF1 đã nhận đơn', () => {
    expect(docPhanHoiOf1(200, {
      status: 'OK',
      data: { status: 'S', code: 200, fileNo: 'BEE-1', message: 'Received' },
    })).toEqual({ ketQua: 'nhan', loi: null, canhBao: [] });
  });

  it('data.status = E là OF1 từ chối — gom hết lỗi validation vào một câu', () => {
    expect(docPhanHoiOf1(200, {
      status: 'OK',
      data: {
        status: 'E', code: 400, message: 'Validation failed',
        errors: ["mode 'SEA_LCL' is invalid", "deliveryPlan must match format"],
      },
    })).toEqual({
      ketQua: 'tu_choi',
      loi: "Validation failed: mode 'SEA_LCL' is invalid; deliveryPlan must match format",
      canhBao: [],
    });
  });

  it('lỗi ở tầng nền tảng (data rỗng) cũng là từ chối', () => {
    // Dạng này gặp khi token sai: HTTP vẫn 200, nhưng lỗi nằm ở khung ngoài.
    expect(docPhanHoiOf1(200, {
      status: 'ERROR',
      error: { errorType: 'NotAuthorized', message: 'You are not authorized' },
      data: null,
    })).toEqual({ ketQua: 'tu_choi', loi: 'NotAuthorized: You are not authorized', canhBao: [] });
  });

  it('HTTP khác 200 là KHÔNG RÕ, không phải từ chối', () => {
    // Tài liệu: "HTTP status luôn là 200 khi request đến được hệ thống". Khác
    // 200 nghĩa là chưa chắc đã tới nơi — có thể nginx chặn giữa đường sau khi
    // đơn đã vào. Đánh là từ chối thì người ta gửi lại và sinh đơn trùng.
    expect(docPhanHoiOf1(502, null).ketQua).toBe('khong_ro');
    expect(docPhanHoiOf1(401, null).ketQua).toBe('khong_ro');
  });

  it('body lạ không đọc được cũng là KHÔNG RÕ', () => {
    expect(docPhanHoiOf1(200, { linh: 'tinh' }).ketQua).toBe('khong_ro');
    expect(docPhanHoiOf1(200, null).ketQua).toBe('khong_ro');
  });

  it('data.status lạ là KHÔNG RÕ chứ không đoán bừa là nhận', () => {
    expect(docPhanHoiOf1(200, { data: { status: 'X' } }).ketQua).toBe('khong_ro');
  });

  /**
   * OF1 tra 'S' KEM canh bao khi no nhan ban ghi nhung bo mot phan — vi du
   * mot dia chi khong dinh vi noi thi ma dia chi ay KHONG duoc luu, va don
   * sau nay tham chieu vao no se bi tu choi. Nuot canh bao la bien mot loi
   * bao truoc thanh mot loi bat ngo o don hang, cach cho gay ra vai ngay.
   */
  it('nhan kem canh bao thi van la nhan, nhung giu lai canh bao', () => {
    expect(docPhanHoiOf1(200, {
      data: { status: 'S', code: 200, message: 'Created', warnings: ['addressCode VM-01 chua dinh vi duoc'] },
    })).toEqual({
      ketQua: 'nhan',
      loi: null,
      canhBao: ['addressCode VM-01 chua dinh vi duoc'],
    });
  });

  /** CUSTOMER va wh-locations dat status/warnings ngay NGOAI, khong trong data. */
  it('doc duoc canh bao o khung ngoai', () => {
    expect(docPhanHoiOf1(200, {
      status: 'S', code: 200, message: 'Created', warnings: ['mot canh bao'],
    }).canhBao).toEqual(['mot canh bao']);
  });
});
