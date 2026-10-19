import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CustomerOtpService } from './customer-otp.service';
import { CustomerProfileService } from './customer-profile.service';

const TOKEN = 'fGx9_tokenFCMdaikhoang150kytu:APA91bH-xxxxxxxxxxxxxxxxxxxx';

interface Calls {
  upsert: jest.Mock;
  deleteMany: jest.Mock;
  qrUpdateMany: jest.Mock;
  userDeviceDeleteMany: jest.Mock;
}

function mkSvc(): { svc: CustomerProfileService; calls: Calls } {
  const upsert = jest.fn().mockResolvedValue({});
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const qrUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
  const userDeviceDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    customerDevice: { upsert, deleteMany },
    quoteRequest: { updateMany: qrUpdateMany },
    userDevice: { deleteMany: userDeviceDeleteMany },
  } as unknown as PrismaService;

  const svc = new CustomerProfileService(
    prisma,
    {} as CustomerOtpService,
    { get: () => undefined } as never,
    { log: jest.fn() } as unknown as ActivityService,
  );
  return { svc, calls: { upsert, deleteMany, qrUpdateMany, userDeviceDeleteMany } };
}

describe('CustomerProfileService.registerDevice', () => {
  it('upsert khớp theo fcmToken, không theo customerId', async () => {
    const { svc, calls } = mkSvc();
    await svc.registerDevice(7, { fcmToken: TOKEN, platform: 'android' });
    expect(calls.upsert).toHaveBeenCalledTimes(1);
    expect(calls.upsert.mock.calls[0][0].where).toEqual({ fcmToken: TOKEN });
  });

  /**
   * Ca đổi chủ máy: khách A logout, khách B login trên cùng thiết bị thì FCM trả
   * về đúng token cũ. Nhánh update PHẢI ghi customerId mới, nếu không máy đó vẫn
   * nhận push của khách A.
   */
  it('token đã tồn tại thì update đổi sang chủ mới', async () => {
    const { svc, calls } = mkSvc();
    await svc.registerDevice(99, { fcmToken: TOKEN, platform: 'web' });
    const { update, create } = calls.upsert.mock.calls[0][0];
    expect(update.customerId).toBe(99);
    expect(create.customerId).toBe(99);
  });

  /**
   * Ca máy đổi chủ đầy đủ: máy này từng gửi form public khi chưa đăng nhập nên
   * `quote_requests.fcm_token` còn giữ token. Dòng vãng lai đó KHÔNG có cột chủ và
   * không có đường huỷ (unregisterDevice chỉ đụng customer_devices), nên nếu không
   * dọn ở đây thì máy vừa đổi chủ vẫn nhận push của yêu cầu báo giá cũ.
   */
  it('xoá claim vãng lai còn sót trên cùng token', async () => {
    const { svc, calls } = mkSvc();
    await svc.registerDevice(7, { fcmToken: TOKEN, platform: 'android' });
    expect(calls.qrUpdateMany).toHaveBeenCalledWith({
      where: { fcmToken: TOKEN, customerId: null },
      data: { fcmToken: null },
    });
  });

  /**
   * `customerId: null` trong where là phần bắt buộc: dòng quote_request của MỘT
   * KHÁCH ĐÃ ĐĂNG NHẬP khác không được đụng tới.
   */
  it('chỉ nhắm dòng vãng lai, không đụng dòng đã có chủ', async () => {
    const { svc, calls } = mkSvc();
    await svc.registerDevice(7, { fcmToken: TOKEN, platform: 'android' });
    expect(calls.qrUpdateMany.mock.calls[0][0].where.customerId).toBeNull();
  });

  it('mỗi lần đăng ký lại đều dời lastSeenAt — dùng làm heartbeat', async () => {
    const { svc, calls } = mkSvc();
    const before = Date.now();
    await svc.registerDevice(7, { fcmToken: TOKEN, platform: 'ios' });
    const { update } = calls.upsert.mock.calls[0][0];
    expect(update.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('CustomerProfileService.unregisterDevice', () => {
  it('ràng cả customerId nên không xoá được token của khách khác', async () => {
    const { svc, calls } = mkSvc();
    await svc.unregisterDevice(7, TOKEN);
    expect(calls.deleteMany).toHaveBeenCalledWith({
      where: { fcmToken: TOKEN, customerId: 7 },
    });
  });

  /**
   * Token FCM là UNIQUE nhưng chỉ TRONG MỘT BẢNG — customer_devices và
   * user_devices không biết gì về nhau. Máy công ty dùng chung ca kíp: nhân
   * viên đăng xuất, khách đăng nhập, dòng cũ bên user_devices còn nguyên nên
   * máy đó nhận push của CẢ HAI phía. Thông báo nội bộ về đơn hàng rơi sang
   * màn hình khách.
   *
   * Chiều ngược lại (nhân viên đăng ký thì gỡ khỏi customer_devices) đã có sẵn
   * từ lúc dựng push nhân viên; thiếu đúng chiều này.
   */
  it('đăng ký cho khách thì gỡ token khỏi user_devices', async () => {
    const { svc, calls } = mkSvc();
    await svc.registerDevice(7, { fcmToken: TOKEN, platform: 'android' });
    expect(calls.userDeviceDeleteMany).toHaveBeenCalledWith({ where: { fcmToken: TOKEN } });
  });

  /** Gỡ theo TOKEN, không theo chủ: mục đích là dọn máy, không phải dọn người. */
  it('gỡ theo token chứ không ràng userId nào', async () => {
    const { svc, calls } = mkSvc();
    await svc.registerDevice(7, { fcmToken: TOKEN, platform: 'android' });
    const where = calls.userDeviceDeleteMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(Object.keys(where)).toEqual(['fcmToken']);
  });
});
