import { CustomerNotifType, NotifType } from '@/common/enums';
import { FcmService } from '@/common/fcm/fcm.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PushCron } from './push.cron';

interface Row {
  id: number;
  user_id: number | null;
  customer_id: number | null;
  quote_request_id: number | null;
  order_id: number | null;
  type: string;
  title: string;
  body: string | null;
}

interface Fixture {
  claimed?: Row[];
  userDevices?: Array<{ userId: number; fcmToken: string }>;
  users?: Array<{ id: number; pushOff: string[] }>;
  devices?: Array<{ customerId: number; fcmToken: string }>;
  guests?: Array<{ id: number; fcmToken: string | null }>;
  accounts?: Array<{ id: number; pushOff: string[] }>;
  sendResult?: { ok: string[]; dead: string[] };
}

const STAFF_ROW: Row = {
  id: 100,
  user_id: 5,
  customer_id: null,
  quote_request_id: null,
  order_id: 3,
  type: NotifType.NEW_ORDER as string,
  title: 'Đơn mới BEE-001',
  body: 'Vận tải biển',
};

const CUST_ROW: Row = {
  id: 200,
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
  const sendEach = jest.fn().mockResolvedValue(f.sendResult ?? { ok: [], dead: [] });
  const userDeviceFindMany = jest.fn().mockResolvedValue(f.userDevices ?? []);
  const userDeviceDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const custDeviceFindMany = jest.fn().mockResolvedValue(f.devices ?? []);
  const userFindMany = jest.fn().mockResolvedValue(f.users ?? []);
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
    userDevice: { findMany: userDeviceFindMany, deleteMany: userDeviceDeleteMany },
    user: { findMany: userFindMany },
    customerDevice: {
      findMany: custDeviceFindMany,
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    quoteRequest: {
      findMany: jest.fn().mockResolvedValue(f.guests ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    customerAccount: { findMany: jest.fn().mockResolvedValue(f.accounts ?? []) },
  } as unknown as PrismaService;

  const fcm = { isEnabled: true, sendEach } as unknown as FcmService;
  return {
    cron: new PushCron(prisma, fcm),
    updateMany,
    sendEach,
    userDeviceFindMany,
    userDeviceDeleteMany,
    custDeviceFindMany,
    getClaimSql: () => claimSql,
  };
}

/** id thông báo -> token đã gửi, gom từ mọi lượt gọi sendEach. */
function sentBy(sendEach: jest.Mock): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [tokens, msg] of sendEach.mock.calls) out.set(msg.data.id, [...tokens].sort());
  return out;
}

describe('PushCron — dòng của nhân viên', () => {
  /**
   * Trước khi mở rộng, claim() lọc `user_id IS NULL` nên dòng nhân viên không bao
   * giờ được lấy. Bỏ vế đó là toàn bộ điểm của B-04 nửa sau.
   */
  it('claim lấy cả dòng nhân viên lẫn dòng khách', async () => {
    const { cron, updateMany, getClaimSql } = mk({ claimed: [STAFF_ROW, CUST_ROW] });
    await cron.flushPush();
    expect(getClaimSql()).toMatch(/pushed_at IS NULL/);
    expect(getClaimSql()).not.toMatch(/user_id IS NULL/);
    expect(updateMany.mock.calls[0][0].where.id.in.sort()).toEqual([100, 200]);
  });

  it('token nhân viên tra từ user_devices, lọc theo userId', async () => {
    const { cron, sendEach, userDeviceFindMany } = mk({
      claimed: [STAFF_ROW],
      userDevices: [
        { userId: 5, fcmToken: 'tok-nv-dt' },
        { userId: 5, fcmToken: 'tok-nv-web' },
      ],
    });
    await cron.flushPush();
    expect(userDeviceFindMany.mock.calls[0][0].where).toEqual({ userId: { in: [5] } });
    expect([...sendEach.mock.calls[0][0]].sort()).toEqual(['tok-nv-dt', 'tok-nv-web']);
  });

  /**
   * Không có vế này thì nhân viên bị dội push mà không có đường tắt — đối xứng
   * với customer_accounts.push_off.
   */
  it('users.push_off chứa đúng loại thì không gửi', async () => {
    const { cron, sendEach } = mk({
      claimed: [STAFF_ROW],
      userDevices: [{ userId: 5, fcmToken: 'tok-nv' }],
      users: [{ id: 5, pushOff: [NotifType.NEW_ORDER] }],
    });
    await cron.flushPush();
    expect(sendEach).not.toHaveBeenCalled();
  });

  it('users.push_off chứa loại KHÁC thì vẫn gửi', async () => {
    const { cron, sendEach } = mk({
      claimed: [STAFF_ROW],
      userDevices: [{ userId: 5, fcmToken: 'tok-nv' }],
      users: [{ id: 5, pushOff: [NotifType.SLA_LATE] }],
    });
    await cron.flushPush();
    expect(sendEach).toHaveBeenCalled();
  });

  /**
   * Đúng tình trạng production ngay sau khi deploy: 130 dòng nhân viên tồn đọng,
   * chưa máy nào đăng ký. Phải đóng dấu pushed_at để chúng thôi quay lại mỗi
   * vòng cron, và tuyệt đối không gọi FCM với danh sách token rỗng.
   */
  it('nhân viên chưa có thiết bị: vẫn đóng dấu pushed_at, không gọi FCM', async () => {
    const { cron, updateMany, sendEach } = mk({ claimed: [STAFF_ROW], userDevices: [] });
    await cron.flushPush();
    expect(updateMany).toHaveBeenCalled();
    expect(sendEach).not.toHaveBeenCalled();
  });

  it('token nhân viên chết thì bị xoá khỏi user_devices', async () => {
    const { cron, userDeviceDeleteMany } = mk({
      claimed: [STAFF_ROW],
      userDevices: [{ userId: 5, fcmToken: 'tok-chet' }],
      sendResult: { ok: [], dead: ['tok-chet'] },
    });
    await cron.flushPush();
    expect(userDeviceDeleteMany).toHaveBeenCalledWith({ where: { fcmToken: { in: ['tok-chet'] } } });
  });
});

describe('PushCron — hai loại chủ thể không lẫn sang nhau', () => {
  /**
   * Hồi quy quan trọng nhất của lần mở rộng này: luồng khách đang chạy thật trên
   * production. Một lượt claim lẫn cả hai loại dòng thì mỗi dòng vẫn phải đi
   * đúng nguồn token của mình.
   */
  it('cùng một lượt claim: dòng khách ra token khách, dòng nhân viên ra token nhân viên', async () => {
    const { cron, sendEach } = mk({
      claimed: [STAFF_ROW, CUST_ROW],
      userDevices: [{ userId: 5, fcmToken: 'tok-nv' }],
      devices: [{ customerId: 7, fcmToken: 'tok-khach' }],
    });
    await cron.flushPush();
    const sent = sentBy(sendEach as jest.Mock);
    expect(sent.get('100')).toEqual(['tok-nv']);
    expect(sent.get('200')).toEqual(['tok-khach']);
  });

  /**
   * users.id và customer_accounts.id là hai sequence trùng nhau dày đặc. Nhân
   * viên id 5 và khách id 5 cùng tồn tại là chuyện thường — nếu resolveTokens
   * gộp hai map theo id thì thông báo nội bộ bay thẳng ra điện thoại khách.
   */
  it('nhân viên id 5 và khách id 5 không dùng chung token của nhau', async () => {
    const { cron, sendEach } = mk({
      claimed: [STAFF_ROW, { ...CUST_ROW, customer_id: 5 }],
      userDevices: [{ userId: 5, fcmToken: 'tok-nv' }],
      devices: [{ customerId: 5, fcmToken: 'tok-khach' }],
    });
    await cron.flushPush();
    const sent = sentBy(sendEach as jest.Mock);
    expect(sent.get('100')).toEqual(['tok-nv']);
    expect(sent.get('200')).toEqual(['tok-khach']);
  });

  /**
   * push_off của nhân viên và của khách là hai cột khác bảng. Tắt ở bên này
   * không được im lặng chặn bên kia.
   */
  it('push_off của khách không chặn dòng nhân viên cùng id', async () => {
    const { cron, sendEach } = mk({
      claimed: [STAFF_ROW],
      userDevices: [{ userId: 5, fcmToken: 'tok-nv' }],
      accounts: [{ id: 5, pushOff: [NotifType.NEW_ORDER] }],
    });
    await cron.flushPush();
    expect(sendEach).toHaveBeenCalled();
  });

  /** Không có dòng nhân viên nào thì không tốn round-trip nào sang user_devices. */
  it('lượt claim toàn dòng khách thì không truy vấn user_devices', async () => {
    const { cron, userDeviceFindMany } = mk({
      claimed: [CUST_ROW],
      devices: [{ customerId: 7, fcmToken: 'tok-khach' }],
    });
    await cron.flushPush();
    expect(userDeviceFindMany).not.toHaveBeenCalled();
  });

  /** Và ngược lại: lượt toàn dòng nhân viên không đụng bảng của khách. */
  it('lượt claim toàn dòng nhân viên thì không truy vấn customer_devices', async () => {
    const { cron, custDeviceFindMany } = mk({
      claimed: [STAFF_ROW],
      userDevices: [{ userId: 5, fcmToken: 'tok-nv' }],
    });
    await cron.flushPush();
    expect(custDeviceFindMany).not.toHaveBeenCalled();
  });
});
