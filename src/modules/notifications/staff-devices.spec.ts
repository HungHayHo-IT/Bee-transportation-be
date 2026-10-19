import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';

const USER = { id: 5 } as AuthenticatedUser;
const TOKEN = 'tok-cua-may-nhan-vien-0001';

function mk() {
  const upsert = jest.fn().mockResolvedValue({});
  const deviceDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const custDeviceDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const qrUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    userDevice: { upsert, deleteMany: deviceDeleteMany },
    customerDevice: { deleteMany: custDeviceDeleteMany },
    quoteRequest: { updateMany: qrUpdateMany },
  } as unknown as PrismaService;
  return {
    svc: new NotificationsService(prisma),
    upsert,
    deviceDeleteMany,
    custDeviceDeleteMany,
    qrUpdateMany,
  };
}

describe('NotificationsService — thiết bị nhận push của nhân viên', () => {
  /**
   * App gọi lại endpoint này mỗi lần mở / mỗi lần FCM xoay token. Nếu không
   * idempotent thì mỗi lần mở app sinh thêm một dòng và một push thành N push.
   */
  it('đăng ký hai lần cùng token: upsert theo fcmToken, không tạo dòng thứ hai', async () => {
    const { svc, upsert } = mk();
    await svc.registerDevice(USER, { fcmToken: TOKEN, platform: 'android' });
    await svc.registerDevice(USER, { fcmToken: TOKEN, platform: 'android' });
    expect(upsert).toHaveBeenCalledTimes(2);
    for (const call of upsert.mock.calls) {
      expect(call[0].where).toEqual({ fcmToken: TOKEN });
      expect(call[0].update.userId).toBe(5);
      expect(call[0].create.userId).toBe(5);
    }
  });

  /**
   * Cùng một máy, người trước đăng xuất và người sau đăng nhập: Firebase trả
   * đúng token cũ. `update` phải đổi chủ sở hữu, nếu không máy đó vẫn nhận
   * thông báo nội bộ của người cũ.
   */
  it('token đang thuộc nhân viên khác thì được chuyển sang người đang gọi', async () => {
    const { svc, upsert } = mk();
    await svc.registerDevice(USER, { fcmToken: TOKEN, platform: 'web' });
    expect(upsert.mock.calls[0][0].update).toMatchObject({ userId: 5, platform: 'web' });
  });

  /**
   * fcm_token UNIQUE chỉ có hiệu lực TRONG một bảng. Máy vừa đổi từ tài khoản
   * khách sang tài khoản nhân viên mà còn dòng cũ ở customer_devices thì nó
   * nhận push của cả hai — rò dữ liệu khách sang máy nhân viên.
   */
  it('gỡ token khỏi customer_devices và khỏi yêu cầu vãng lai', async () => {
    const { svc, custDeviceDeleteMany, qrUpdateMany } = mk();
    await svc.registerDevice(USER, { fcmToken: TOKEN, platform: 'ios' });
    expect(custDeviceDeleteMany).toHaveBeenCalledWith({ where: { fcmToken: TOKEN } });
    expect(qrUpdateMany).toHaveBeenCalledWith({
      where: { fcmToken: TOKEN, customerId: null },
      data: { fcmToken: null },
    });
  });

  /** deleteMany chứ không delete: huỷ token không tồn tại vẫn 204, không 404. */
  it('huỷ token lạ vẫn chạy trót lọt, ràng cả userId', async () => {
    const { svc, deviceDeleteMany } = mk();
    await expect(svc.unregisterDevice(USER, 'tok-khong-he-ton-tai-x')).resolves.toBeUndefined();
    expect(deviceDeleteMany).toHaveBeenCalledWith({
      where: { fcmToken: 'tok-khong-he-ton-tai-x', userId: 5 },
    });
  });
});
