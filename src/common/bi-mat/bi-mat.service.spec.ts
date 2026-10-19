import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { docKhoa, maHoa } from './bi-mat.helper';
import { BiMatService } from './bi-mat.service';

const B64 = randomBytes(32).toString('base64');
const KHOA = docKhoa(B64);

function dung(env: Record<string, string>): BiMatService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new BiMatService(config);
}

describe('BiMatService.doc', () => {
  it('trả nguyên văn giá trị không mã hoá, kể cả khi không có khoá', () => {
    expect(dung({ OF1_TMS_URL: 'https://of1-beta.datatp.net' }).doc('OF1_TMS_URL'))
      .toBe('https://of1-beta.datatp.net');
  });

  it('giải mã giá trị có tiền tố enc:', () => {
    const svc = dung({
      APP_SECRET_KEY: B64,
      OF1_TOKEN: maHoa('token-that', KHOA),
    });
    expect(svc.doc('OF1_TOKEN')).toBe('token-that');
  });

  it('NÉM LỖI khi giá trị đang mã hoá mà thiếu khoá', () => {
    // Tra ve nguyen chuoi `enc:...` la te nhat: BeeOps dem no di goi OF1 nhu
    // the do la token, nhan 401, va khong ai doan ra vi sao.
    const svc = dung({ OF1_TOKEN: maHoa('token-that', KHOA) });
    expect(() => svc.doc('OF1_TOKEN')).toThrow(/chưa có khoá/);
  });

  it('biến chưa khai thì là chuỗi rỗng, không phải undefined', () => {
    expect(dung({}).doc('OF1_TOKEN')).toBe('');
  });
});
