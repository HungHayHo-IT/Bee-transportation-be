import { CustomerNotifType } from '@/common/enums';
import { FcmService } from '@/common/fcm/fcm.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PushCron } from './push.cron';

interface Fixture {
  claimed?: Array<{
    id: number;
    user_id: number | null;
    customer_id: number | null;
    quote_request_id: number | null;
    order_id: number | null;
    type: string;
    title: string;
    body: string | null;
  }>;
  devices?: Array<{ customerId: number; fcmToken: string }>;
  guests?: Array<{ id: number; fcmToken: string | null }>;
  accounts?: Array<{ id: number; pushOff: string[] }>;
  sendResult?: { ok: string[]; dead: string[] };
  fcmEnabled?: boolean;
  /** Cho customerDevice.findMany ném — mô phỏng lỗi DB trong resolveTokens(). */
  resolveFails?: boolean;
}

const ROW = {
  id: 1,
  user_id: null,
  customer_id: 7,
  quote_request_id: 12,
  order_id: 3,
  type: CustomerNotifType.QUOTE_READY as string,
  title: 'Báo giá đã có',
  body: '12.500.000đ',
};

function mk(f: Fixture) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const deviceDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const qrUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const sendEach = jest.fn().mockResolvedValue(f.sendResult ?? { ok: [], dead: [] });
  // Ghép lại đúng câu SQL mà claim() gửi đi, để test được câu WHERE thật sự chứ
  // không phải hành vi của fake — xem finding 1 trong review.
  let claimSql = '';

  const prisma = {
    $transaction: (fn: (tx: unknown) => unknown) =>
      Promise.resolve(
        fn({
          $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
            claimSql = strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
            return Promise.resolve(f.claimed ?? []);
          },
          notification: { updateMany },
        }),
      ),
    userDevice: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    customerDevice: {
      findMany: f.resolveFails
        ? jest.fn().mockRejectedValue(new Error('DB rot'))
        : jest.fn().mockResolvedValue(f.devices ?? []),
      deleteMany: deviceDeleteMany,
    },
    quoteRequest: {
      findMany: jest.fn().mockResolvedValue(f.guests ?? []),
      updateMany: qrUpdateMany,
    },
    customerAccount: { findMany: jest.fn().mockResolvedValue(f.accounts ?? []) },
  } as unknown as PrismaService;

  const fcm = { isEnabled: f.fcmEnabled ?? true, sendEach } as unknown as FcmService;
  return {
    cron: new PushCron(prisma, fcm),
    updateMany,
    deviceDeleteMany,
    qrUpdateMany,
    sendEach,
    getClaimSql: () => claimSql,
  };
}

describe('PushCron.flushPush — giải token', () => {
  it('khách có tài khoản: lấy mọi token trong customer_devices', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [
        { customerId: 7, fcmToken: 'tok-dt' },
        { customerId: 7, fcmToken: 'tok-web' },
      ],
    });
    await cron.flushPush();
    expect(sendEach.mock.calls[0][0].sort()).toEqual(['tok-dt', 'tok-web']);
  });

  it('khách vãng lai: lấy token từ quote_requests.fcm_token', async () => {
    const { cron, sendEach } = mk({
      claimed: [{ ...ROW, customer_id: null }],
      guests: [{ id: 12, fcmToken: 'tok-guest' }],
    });
    await cron.flushPush();
    expect(sendEach.mock.calls[0][0]).toEqual(['tok-guest']);
  });

  /**
   * fcm_token UNIQUE toàn cục trên customer_devices (migration 014) và mỗi dòng
   * thông báo chỉ đi đúng một trong hai nhánh (customer_id XOR quote_request_id)
   * — không cần khử trùng lặp, chỉ cần gửi đúng cả hai thiết bị thật của khách.
   */
  it('khách có hai thiết bị khác token thì cả hai đều nhận', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [
        { customerId: 7, fcmToken: 'tok-a' },
        { customerId: 7, fcmToken: 'tok-b' },
      ],
    });
    await cron.flushPush();
    expect(sendEach.mock.calls[0][0].sort()).toEqual(['tok-a', 'tok-b']);
  });

  it('loại nằm trong push_off thì không gửi', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
      accounts: [{ id: 7, pushOff: [CustomerNotifType.QUOTE_READY] }],
    });
    await cron.flushPush();
    expect(sendEach).not.toHaveBeenCalled();
  });

  it('push_off chứa loại KHÁC thì vẫn gửi', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
      accounts: [{ id: 7, pushOff: [CustomerNotifType.ORDER_MILESTONE] }],
    });
    await cron.flushPush();
    expect(sendEach).toHaveBeenCalled();
  });

  /** Khách chưa cấp quyền thông báo không phải là lỗi — dòng vẫn ở lại hộp thư. */
  it('không có token nào thì vẫn đánh dấu đã xử lý', async () => {
    const { cron, updateMany, sendEach } = mk({ claimed: [ROW], devices: [] });
    await cron.flushPush();
    expect(sendEach).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalled();
  });
});

describe('PushCron.flushPush — đánh dấu và dọn dẹp', () => {
  /**
   * Đặt pushed_at NGAY trong transaction claim, trước khi gọi FCM. Nghĩa là "cron
   * đã xử lý", không phải "đã gửi" — giống hệt emailed_at. Thà mất một push khi
   * process chết giữa chừng còn hơn bắn trùng mỗi 30 giây.
   */
  it('đặt pushed_at trong transaction claim, trước khi gọi FCM', async () => {
    const order: string[] = [];
    const { cron, updateMany, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
    });
    updateMany.mockImplementation(() => {
      order.push('mark');
      return Promise.resolve({ count: 1 });
    });
    sendEach.mockImplementation(() => {
      order.push('send');
      return Promise.resolve({ ok: ['tok-x'], dead: [] });
    });
    await cron.flushPush();
    expect(order).toEqual(['mark', 'send']);
  });

  it('token chết thì xoá customer_devices và clear quote_requests.fcm_token', async () => {
    const { cron, deviceDeleteMany, qrUpdateMany } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-dead' }],
      sendResult: { ok: [], dead: ['tok-dead'] },
    });
    await cron.flushPush();
    expect(deviceDeleteMany).toHaveBeenCalledWith({ where: { fcmToken: { in: ['tok-dead'] } } });
    expect(qrUpdateMany).toHaveBeenCalledWith({
      where: { fcmToken: { in: ['tok-dead'] } },
      data: { fcmToken: null },
    });
  });

  it('không có token chết thì không đụng tới DB thiết bị', async () => {
    const { cron, deviceDeleteMany, qrUpdateMany } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
      sendResult: { ok: ['tok-x'], dead: [] },
    });
    await cron.flushPush();
    expect(deviceDeleteMany).not.toHaveBeenCalled();
    expect(qrUpdateMany).not.toHaveBeenCalled();
  });

  it('không claim được dòng nào thì thoát sớm, không gọi FCM', async () => {
    const { cron, updateMany, sendEach } = mk({ claimed: [] });
    await cron.flushPush();
    expect(updateMany).not.toHaveBeenCalled();
    expect(sendEach).not.toHaveBeenCalled();
  });

  /**
   * Câu SQL claim chỉ còn lọc dòng đã xử lý. Vế `user_id IS NULL` cũ đã chuyển
   * xuống resolveTokens (migration 019) — việc "thông báo nội bộ không được rơi
   * ra điện thoại khách" nay do nhánh chủ sở hữu bảo đảm, xem push-staff.spec.ts.
   *
   * Vị từ của notifications_push_idx phải khớp ĐÚNG câu WHERE này, nếu không
   * planner bỏ index và cron seq scan cả bảng notifications mỗi 30 giây.
   */
  it('câu SQL claim lọc pushed_at IS NULL, không còn ràng user_id', async () => {
    const { cron, getClaimSql } = mk({ claimed: [] });
    await cron.flushPush();
    const sql = getClaimSql();
    expect(sql).toMatch(/pushed_at IS NULL/);
    expect(sql).not.toMatch(/user_id IS NULL/);
  });

  /**
   * Credential Firebase thiếu/hỏng: FcmService.isEnabled = false. Nếu vẫn claim
   * và đóng dấu pushed_at, các dòng đó vĩnh viễn không còn cơ hội đẩy lại khi
   * credential được khôi phục.
   */
  it('FCM tắt (isEnabled=false) thì không claim, không đóng dấu pushed_at', async () => {
    const { cron, updateMany, sendEach } = mk({ claimed: [ROW], fcmEnabled: false });
    await cron.flushPush();
    expect(updateMany).not.toHaveBeenCalled();
    expect(sendEach).not.toHaveBeenCalled();
  });

  /**
   * resolveTokens() chạy SAU khi transaction claim đã COMMIT: tới 100 dòng đã mang
   * pushed_at. Một lỗi DB thoáng qua ở đây không rollback được gì, nên để nó văng
   * ra khỏi @Cron chỉ thêm một unhandled rejection chứ không cứu được dòng nào.
   */
  it('resolveTokens ném lỗi thì flushPush vẫn resolve, không ném ra ngoài', async () => {
    const { cron, sendEach } = mk({ claimed: [ROW], resolveFails: true });
    await expect(cron.flushPush()).resolves.toBeUndefined();
    expect(sendEach).not.toHaveBeenCalled();
  });
});

describe('PushCron.flushPush — nội dung gói FCM', () => {
  /**
   * Không có id thì client tap vào push không biết đánh dấu đã đọc dòng nào, phải
   * gọi thêm một lượt hộp thư để dò — và cũng không khử được push trùng.
   */
  it('data mang theo id của dòng thông báo', async () => {
    const { cron, sendEach } = mk({
      claimed: [ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-x' }],
    });
    await cron.flushPush();
    expect(sendEach.mock.calls[0][1].data).toEqual({
      id: '1',
      type: CustomerNotifType.QUOTE_READY,
      orderId: '3',
      quoteRequestId: '12',
    });
  });
});
