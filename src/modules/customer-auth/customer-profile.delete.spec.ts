import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerOtpService } from './customer-otp.service';
import { CustomerProfileService } from './customer-profile.service';

const ACCOUNT = { id: 9, email: 'Khach@Example.com' };

interface Calls {
  otpDeleteMany: jest.Mock;
  accountDelete: jest.Mock;
  activityLog: jest.Mock;
  /** Thứ tự thực tế các lệnh chạy trong transaction. */
  order: string[];
}

/**
 * Prisma giả tối thiểu: chỉ những truy vấn deleteAccount dùng tới. `$transaction`
 * nhận callback nên tx phải là chính object này — mock trả về nó để assert được
 * rằng cả ba lệnh đi chung một tx chứ không rơi ra ngoài.
 */
function mkDeps(account: typeof ACCOUNT | null): { svc: CustomerProfileService; calls: Calls } {
  const order: string[] = [];
  const otpDeleteMany = jest.fn(() => { order.push('otp'); return Promise.resolve({ count: 2 }); });
  const accountDelete = jest.fn(() => { order.push('account'); return Promise.resolve(ACCOUNT); });
  const activityLog = jest.fn(() => { order.push('activity'); return Promise.resolve(); });

  const prisma = {
    customerAccount: {
      findUniqueOrThrow: jest.fn(() => (account
        ? Promise.resolve(account)
        : Promise.reject(new Error('No CustomerAccount found')))),
      delete: accountDelete,
    },
    customerOtp: { deleteMany: otpDeleteMany },
  } as unknown as PrismaService;
  // tx chính là prisma giả — đủ để kiểm tra thứ tự và tham số.
  (prisma as unknown as { $transaction: unknown }).$transaction =
    jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(prisma));

  const activity = { log: activityLog } as unknown as ActivityService;
  const otp = {} as CustomerOtpService;
  const config = { get: () => undefined } as never;

  return {
    svc: new CustomerProfileService(prisma, otp, config, activity),
    calls: { otpDeleteMany, accountDelete, activityLog, order },
  };
}

describe('CustomerProfileService.deleteAccount', () => {
  it('xoá OTP trước rồi mới xoá tài khoản, và ghi audit', async () => {
    const { svc, calls } = mkDeps(ACCOUNT);
    await svc.deleteAccount(ACCOUNT.id);
    // OTP phải đi trước: xoá account xong thì không còn email để lần ra OTP mồ côi.
    expect(calls.order).toEqual(['otp', 'account', 'activity']);
  });

  it('xoá OTP khớp theo email của tài khoản, không phải theo id', async () => {
    const { svc, calls } = mkDeps(ACCOUNT);
    await svc.deleteAccount(ACCOUNT.id);
    expect(calls.otpDeleteMany).toHaveBeenCalledWith({ where: { email: ACCOUNT.email } });
    expect(calls.accountDelete).toHaveBeenCalledWith({ where: { id: ACCOUNT.id } });
  });

  it('id không tồn tại thì ném lỗi và không xoá gì', async () => {
    const { svc, calls } = mkDeps(null);
    await expect(svc.deleteAccount(404)).rejects.toThrow();
    expect(calls.otpDeleteMany).not.toHaveBeenCalled();
    expect(calls.accountDelete).not.toHaveBeenCalled();
  });
});
