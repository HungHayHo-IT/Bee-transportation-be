import { randomBytes } from 'node:crypto';
import { docKhoa, giaiMa, maHoa, TIEN_TO_MA_HOA } from './bi-mat.helper';

const KHOA = docKhoa(randomBytes(32).toString('base64'));

describe('maHoa / giaiMa', () => {
  it('mã hoá rồi giải mã ra đúng chuỗi ban đầu', () => {
    const goc = 'MW36LHYH4BTT2J6UPSF46QHSABP3RHHWHJB6L55DTMOEV3HOHWM';
    const kin = maHoa(goc, KHOA);
    expect(kin).toMatch(/^enc:/);
    expect(kin).not.toContain(goc);
    expect(giaiMa(kin, KHOA)).toBe(goc);
  });

  it('mã hoá hai lần cùng một chuỗi ra hai kết quả khác nhau', () => {
    // Moi lan mot IV moi. Giong nhau thi nguoi doc .env biet hai bien cung gia
    // tri, va lo luon viec doi token ma quen doi cho khac.
    expect(maHoa('xin chao', KHOA)).not.toBe(maHoa('xin chao', KHOA));
  });

  it('giữ nguyên giá trị KHÔNG mã hoá — để chuyển dần, không phải đổi hết một lượt', () => {
    expect(giaiMa('https://of1-beta.datatp.net', KHOA)).toBe('https://of1-beta.datatp.net');
    expect(giaiMa('', KHOA)).toBe('');
  });

  it('ném lỗi khi chuỗi mã hoá bị sửa — KHÔNG trả về rác', () => {
    // AES-GCM co the xac thuc. Thieu buoc nay thi sua mot byte trong .env se
    // cho ra mot token rac, va he thong gui rac di thay vi bao hong.
    const kin = maHoa('token-that', KHOA);
    const hong = `${TIEN_TO_MA_HOA}${Buffer.from('rac rac rac rac rac').toString('base64')}`;
    expect(() => giaiMa(hong, KHOA)).toThrow();
    expect(() => giaiMa(kin, docKhoa(randomBytes(32).toString('base64')))).toThrow();
  });

  it('docKhoa đòi đúng 32 byte', () => {
    expect(() => docKhoa(randomBytes(16).toString('base64'))).toThrow(/32 byte/);
    expect(() => docKhoa('')).toThrow();
    expect(docKhoa(randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  it('docKhoa bỏ khoảng trắng thừa — khoá đọc từ file luôn dính xuống dòng cuối', () => {
    const b64 = randomBytes(32).toString('base64');
    expect(docKhoa(`  ${b64}\n`)).toEqual(docKhoa(b64));
  });
});
