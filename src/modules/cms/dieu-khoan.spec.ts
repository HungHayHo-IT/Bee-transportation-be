import { ghepDieuKhoan } from './dieu-khoan.helper';

const A = { title: 'Phạm vi dịch vụ', body: 'Bên vận chuyển nhận hàng tại kho.' };
const B = { title: 'Giới hạn bồi thường', body: 'Tối đa theo giá trị khai báo.' };

describe('ghepDieuKhoan', () => {
  it('đánh số theo thứ tự và ngăn cách bằng một dòng trống', () => {
    expect(ghepDieuKhoan([A, B])).toBe(
      '1. Phạm vi dịch vụ\nBên vận chuyển nhận hàng tại kho.\n\n'
      + '2. Giới hạn bồi thường\nTối đa theo giá trị khai báo.',
    );
  });

  // So dang theo VI TRI trong mang, khong theo sort_order hay id. Tat mot dieu
  // o giua thi danh sach con lai van la 1, 2, 3 - khong thung so.
  it('số chạy liên tục, không hở khi một điều bị bỏ ra', () => {
    expect(ghepDieuKhoan([B])).toMatch(/^1\. Giới hạn bồi thường/);
  });

  it('cắt khoảng trắng thừa hai đầu', () => {
    expect(ghepDieuKhoan([{ title: '  Tiêu đề  ', body: '\n Nội dung \n' }]))
      .toBe('1. Tiêu đề\nNội dung');
  });

  // Ben goi quyet dinh lam gi voi chuoi rong - cho do moi biet dang gui cho
  // khach ky hay chi xem thu.
  it('không có điều nào thì trả chuỗi rỗng, không ném lỗi', () => {
    expect(ghepDieuKhoan([])).toBe('');
  });
});
