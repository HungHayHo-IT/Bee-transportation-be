import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from '@/modules/auth/dto/auth.dto';
import {
  CheckEmailDto, LoginPinDto, SendOtpDto, VerifyOtpDto,
} from '@/modules/customer-auth/dto/customer-auth.dto';
import { CreateQuoteRequestDto } from '@/modules/quote-requests/dto/quote-request.dto';
import { CreateUserDto } from '@/modules/users/dto/user.dto';

/**
 * Dán email từ Excel, Zalo hay một email khác gần như luôn kèm khoảng trắng ở
 * đầu hoặc cuối. `@IsEmail()` một mình KHÔNG tự cắt, nên " a@b.c " bị trả 400
 * "email must be an email" cho một email hoàn toàn hợp lệ — và service có gọi
 * `.trim()` cũng vô ích vì validation đã chặn trước khi service nhìn thấy chuỗi.
 *
 * Cách chữa là đặt `@TrimmedText()` TRƯỚC `@IsEmail()`, đúng lối mà repo đã dùng
 * cho lý do huỷ đơn (QA-32).
 */
/**
 * RegisterDto kể từ khi đăng ký dùng vé thì không còn trường email nữa — email nằm
 * trong vé, server tự đọc ra và đã chuẩn hoá từ lúc ký. Chỗ khách gõ email là
 * SendOtpDto và VerifyOtpDto, hai cái đó vẫn nằm trong bảng dưới.
 */
const OK = 'nguoi.dung@congty.vn';

describe('Email trong DTO được cắt khoảng trắng trước khi validate', () => {
  it.each([
    ['CheckEmailDto', CheckEmailDto, {}],
    ['SendOtpDto', SendOtpDto, { purpose: 'register' }],
    ['VerifyOtpDto', VerifyOtpDto, { purpose: 'register', code: '123456' }],
    ['LoginPinDto', LoginPinDto, { pin: '123456' }],
    ['LoginDto (nhân viên)', LoginDto, { password: 'mat-khau' }],
    ['CreateUserDto', CreateUserDto, { fullName: 'A', roles: ['sale'] }],
  ])('%s: khoảng trắng hai đầu vẫn hợp lệ và bị cắt', (_label, Cls, rest) => {
    const dto = plainToInstance(Cls as never, { ...rest, email: `  ${OK}  ` }) as { email: string };
    const loi = validateSync(dto as object).filter((e) => e.property === 'email');
    expect(loi).toHaveLength(0);
    expect(dto.email).toBe(OK);
  });

  /** Trường optional: có gõ thì vẫn phải được cắt, bỏ trống thì không sao. */
  it('CreateQuoteRequestDto: email optional vẫn được cắt khi có gõ', () => {
    const dto = plainToInstance(CreateQuoteRequestDto, {
      customerName: 'Cty ABC', phone: '0900000000', email: ` ${OK} `,
    });
    expect(validateSync(dto).filter((e) => e.property === 'email')).toHaveLength(0);
    expect(dto.email).toBe(OK);
  });

  /** Cắt khoảng trắng KHÔNG được nới lỏng validate: email sai vẫn phải bị chặn. */
  it.each([
    ['thiếu @', '  khongcoa-còng  '],
    ['chỉ có khoảng trắng', '     '],
    ['thiếu tên miền', '  a@  '],
  ])('email sai (%s) vẫn bị từ chối', (_label, raw) => {
    const dto = plainToInstance(CheckEmailDto, { email: raw });
    expect(validateSync(dto).filter((e) => e.property === 'email')).not.toHaveLength(0);
  });

  /** Thông điệp lỗi riêng của từng field phải giữ nguyên sau khi thêm decorator. */
  it('LoginDto giữ thông điệp tiếng Việt "Email không hợp lệ"', () => {
    const dto = plainToInstance(LoginDto, { email: 'sai', password: 'x' });
    const loi = validateSync(dto).find((e) => e.property === 'email');
    expect(Object.values(loi?.constraints ?? {})).toContain('Email không hợp lệ');
  });
});
