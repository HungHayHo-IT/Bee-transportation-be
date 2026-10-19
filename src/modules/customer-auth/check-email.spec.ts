import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerOtpService } from './customer-otp.service';

interface Fixture {
  /** Dòng customer_accounts khớp email, null = chưa có tài khoản khách. */
  customer?: { identities: { provider: string }[]; emailVerifiedAt: Date | null } | null;
  /** Dòng users khớp email, null = không phải nhân viên. */
  staff?: { isActive: boolean } | null;
}

function mk(f: Fixture = {}) {
  const customerFindUnique = jest.fn().mockResolvedValue(f.customer ?? null);
  const userFindUnique = jest.fn().mockResolvedValue(f.staff ?? null);
  const prisma = {
    customerAccount: { findUnique: customerFindUnique },
    user: { findUnique: userFindUnique },
  } as unknown as PrismaService;

  const svc = new CustomerAuthService(
    prisma,
    {} as CustomerOtpService,
    {} as JwtService,
    { get: () => undefined } as unknown as ConfigService,
  );
  return { svc, customerFindUnique, userFindUnique };
}

const VERIFIED = { identities: [{ provider: 'email' }], emailVerifiedAt: new Date() };

describe('CustomerAuthService.checkEmail — phân biệt nhân viên và khách', () => {
  it('email chỉ là khách hàng thì isStaff = false', async () => {
    const { svc } = mk({ customer: VERIFIED, staff: null });
    const res = await svc.checkEmail('a@b.c');
    expect(res.exists).toBe(true);
    expect(res.isStaff).toBe(false);
  });

  /**
   * Ca chính: nhân viên gõ email công ty vào cổng khách. Trước khi có cờ này FE
   * thấy exists=false nên đẩy họ sang luồng đăng ký khách; giờ chuyển được sang
   * màn đăng nhập nội bộ.
   */
  it('email chỉ là nhân viên thì exists = false nhưng isStaff = true', async () => {
    const { svc } = mk({ customer: null, staff: { isActive: true } });
    const res = await svc.checkEmail('sale@beetransportation.vn');
    expect(res.exists).toBe(false);
    expect(res.isStaff).toBe(true);
  });

  /** Nhân viên đồng thời là khách hàng — hai sự thật độc lập, trả cả hai. */
  it('email vừa là nhân viên vừa là khách thì cả hai cùng true', async () => {
    const { svc } = mk({ customer: VERIFIED, staff: { isActive: true } });
    const res = await svc.checkEmail('a@b.c');
    expect(res.exists).toBe(true);
    expect(res.isStaff).toBe(true);
  });

  /**
   * Cờ này sinh ra để đưa người dùng tới màn hình họ DÙNG ĐƯỢC. Nhân viên đã
   * khoá mà bị đẩy sang màn Admin thì chỉ nhận "tài khoản đã khoá"; coi là
   * không-phải-nhân-viên để họ đăng ký làm khách mới đúng.
   */
  it('nhân viên đã bị khoá tài khoản thì isStaff = false', async () => {
    const { svc } = mk({ customer: null, staff: { isActive: false } });
    const res = await svc.checkEmail('cunhanvien@beetransportation.vn');
    expect(res.isStaff).toBe(false);
    expect(res.exists).toBe(false);
  });

  it('email không tồn tại ở đâu cả thì cả hai đều false', async () => {
    const { svc } = mk({ customer: null, staff: null });
    const res = await svc.checkEmail('nobody@nowhere.vn');
    expect(res).toEqual({ exists: false, providers: [], emailVerified: false, isStaff: false });
  });

  it('chuẩn hoá hoa/thường và khoảng trắng trước khi tra CẢ HAI bảng', async () => {
    const { svc, customerFindUnique, userFindUnique } = mk();
    await svc.checkEmail('  HOA@X.VN  ');
    expect(customerFindUnique.mock.calls[0][0].where.email).toBe('hoa@x.vn');
    expect(userFindUnique.mock.calls[0][0].where.email).toBe('hoa@x.vn');
  });

  /** Không để lộ gì thêm về tài khoản nội bộ: chỉ hỏi đúng cột cần. */
  it('chỉ chọn isActive từ bảng users, không kéo tên/vai trò/phòng ban', async () => {
    const { svc, userFindUnique } = mk({ staff: { isActive: true } });
    await svc.checkEmail('a@b.c');
    expect(userFindUnique.mock.calls[0][0].select).toEqual({ isActive: true });
  });
});
