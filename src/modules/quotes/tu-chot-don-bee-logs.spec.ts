import { DeptState, OrderStatus } from '@/common/enums';
import { chotDon } from '../orders/chot-don';
import { tuChotDonBeeLogs } from './tu-chot-don-bee-logs';

jest.mock('../orders/chot-don', () => ({ chotDon: jest.fn().mockResolvedValue(undefined) }));

/** Đơn Bee Logistics: Phòng báo giá gửi giá là chốt luôn, không chờ Sale (081). */
function dung(email: string | null, them: Record<string, unknown> = {}) {
  const tx = {
    order: { update: jest.fn() },
    orderDepartment: { updateMany: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        code: 'CON-1', status: OrderStatus.AWAITING_SELECTION, departmentId: null,
        customer: { email }, departments: [{ department: { isQuoting: true } }], ...them,
      }),
    },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const deps = { prisma, activity: {}, notify: {}, customerNotify: {} } as never;
  return { deps, tx };
}

describe('tuChotDonBeeLogs', () => {
  beforeEach(() => jest.mocked(chotDon).mockClear());

  it('đơn Bee Logistics: chọn phòng vừa báo làm phòng thắng rồi chốt', async () => {
    const { deps, tx } = dung('an@beelogistics.com');
    expect(await tuChotDonBeeLogs(deps, 12, 3, 5)).toBe(true);
    expect(tx.orderDepartment.update.mock.calls[0][0].data).toEqual({ state: DeptState.WON });
    expect(jest.mocked(chotDon).mock.calls[0].slice(1, 6)).toEqual([
      12, expect.any(String), 5, 'CON-1', 3,
    ]);
  });

  it('đơn khách thường: không đụng gì, để Sale chọn', async () => {
    const { deps, tx } = dung('kh@congty.vn');
    expect(await tuChotDonBeeLogs(deps, 12, 3, 5)).toBe(false);
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(chotDon).not.toHaveBeenCalled();
  });

  it('đã có phòng thắng thì không chốt lại', async () => {
    const { deps } = dung('an@beelogistics.com', { departmentId: 3 });
    expect(await tuChotDonBeeLogs(deps, 12, 3, 5)).toBe(false);
  });

  it('giá không phải của Phòng báo giá thì không chốt', async () => {
    const { deps } = dung('an@beelogistics.com', { departments: [{ department: { isQuoting: false } }] });
    expect(await tuChotDonBeeLogs(deps, 12, 3, 5)).toBe(false);
  });
});
