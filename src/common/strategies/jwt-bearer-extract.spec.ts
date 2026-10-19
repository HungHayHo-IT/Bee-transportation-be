import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE, JwtStrategy } from './jwt.strategy';
import { CUSTOMER_COOKIE, CustomerJwtStrategy } from './customer-jwt.strategy';

const config = { getOrThrow: () => 'secret-cho-test' } as unknown as ConfigService;
const prisma = {} as PrismaService;

/** passport-jwt giữ extractor đã cấu hình ở đây — gọi thẳng để khỏi dựng cả HTTP stack. */
function extractorOf(strategy: object): (req: unknown) => string | null {
  return (strategy as { _jwtFromRequest: (req: unknown) => string | null })._jwtFromRequest;
}

/**
 * App mobile không có kho cookie dùng chung với trình duyệt, nên nó gửi JWT qua
 * header Authorization. Nếu strategy chỉ đọc cookie thì token hợp lệ vẫn bị 401
 * và không có cách nào để client không-phải-trình-duyệt đăng nhập được.
 */
describe('JWT strategy — đọc được token từ cả cookie lẫn Authorization header', () => {
  it('staff: lấy token từ cookie', () => {
    const extract = extractorOf(new JwtStrategy(config, prisma));
    expect(extract({ cookies: { [ACCESS_COOKIE]: 'tok-cookie' }, headers: {} })).toBe('tok-cookie');
  });

  it('staff: không có cookie thì lấy từ Authorization: Bearer', () => {
    const extract = extractorOf(new JwtStrategy(config, prisma));
    expect(extract({ cookies: {}, headers: { authorization: 'Bearer tok-header' } }))
      .toBe('tok-header');
  });

  it('staff: có cả hai thì cookie được ưu tiên', () => {
    const extract = extractorOf(new JwtStrategy(config, prisma));
    expect(extract({
      cookies: { [ACCESS_COOKIE]: 'tok-cookie' },
      headers: { authorization: 'Bearer tok-header' },
    })).toBe('tok-cookie');
  });

  it('customer: lấy token từ cookie', () => {
    const extract = extractorOf(new CustomerJwtStrategy(config, prisma));
    expect(extract({ cookies: { [CUSTOMER_COOKIE]: 'tok-cookie' }, headers: {} }))
      .toBe('tok-cookie');
  });

  it('customer: không có cookie thì lấy từ Authorization: Bearer', () => {
    const extract = extractorOf(new CustomerJwtStrategy(config, prisma));
    expect(extract({ cookies: {}, headers: { authorization: 'Bearer tok-header' } }))
      .toBe('tok-header');
  });

  it('customer: có cả hai thì cookie được ưu tiên', () => {
    const extract = extractorOf(new CustomerJwtStrategy(config, prisma));
    expect(extract({
      cookies: { [CUSTOMER_COOKIE]: 'tok-cookie' },
      headers: { authorization: 'Bearer tok-header' },
    })).toBe('tok-cookie');
  });

  it('không cookie, không header thì trả null (để guard ném 401 như cũ)', () => {
    const extract = extractorOf(new JwtStrategy(config, prisma));
    expect(extract({ cookies: {}, headers: {} })).toBeNull();
  });
});
