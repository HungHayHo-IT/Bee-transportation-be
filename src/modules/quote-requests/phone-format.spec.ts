import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateQuoteRequestDto } from './dto/quote-request.dto';

const check = (phone: string) => {
  const dto = plainToInstance(CreateQuoteRequestDto, { customerName: 'Cty ABC', phone });
  return { ok: !validateSync(dto).some((e) => e.property === 'phone'), phone: dto.phone };
};

describe('CreateQuoteRequestDto.phone — định dạng số VN', () => {
  it.each(['0912345678', '0912 345 678', '091.234.5678', '+84912345678', '84 912 345 678', '02838123456'])(
    'nhận %s', (p) => expect(check(p).ok).toBe(true),
  );

  it.each(['abcdefgh', '123456', '0112345678', '091234567', '09123456789', '0812-34-56'])(
    'chặn %s', (p) => expect(check(p).ok).toBe(false),
  );

  it('lưu dạng đã bỏ dấu cách', () => expect(check('0912 345 678').phone).toBe('0912345678'));
  it('+84/84 đổi về 0', () => {
    expect(check('+84 912 345 678').phone).toBe('0912345678');
    expect(check('842838123456').phone).toBe('02838123456');
  });
});
