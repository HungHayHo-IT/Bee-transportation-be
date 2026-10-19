import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerAvatarS3Service } from './customer-avatar-s3.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example/signed'),
}));

const FULL = {
  S3_BUCKET: 'bee', S3_REGION: 'ap-southeast-1',
  S3_ACCESS_KEY_ID: 'AK', S3_SECRET_ACCESS_KEY: 'SK',
};

function mk(env: Record<string, string> = FULL): CustomerAvatarS3Service {
  return new CustomerAvatarS3Service({
    get: (k: string) => env[k],
  } as unknown as ConfigService);
}

/**
 * Dev thường không có biến S3_*. Thiếu biến phải là "tính năng tắt", không phải
 * "app không khởi động được" — constructor tuyệt đối không được ném.
 */
describe('CustomerAvatarS3Service — S3 chưa cấu hình', () => {
  it('thiếu biến môi trường thì vẫn dựng được service, chỉ isEnabled=false', () => {
    expect(() => mk({})).not.toThrow();
    expect(mk({}).isEnabled()).toBe(false);
  });

  it('đủ 4 biến thì bật', () => {
    expect(mk().isEnabled()).toBe(true);
  });

  it('xin URL khi chưa cấu hình thì báo lỗi rõ ràng chứ không sập', async () => {
    await expect(mk({}).presignAvatar(1, 'a.png', 'image/png'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(mk({}).presignAvatar(1, 'a.png', 'image/png'))
      .rejects.toThrow(/S3 chưa/i);
  });
});

/**
 * Nhận PDF/HTML làm ảnh đại diện là mở một kho lưu trữ tuỳ tiện công khai, và
 * HTML nằm trên bucket public thì chạy được script -> XSS. Whitelist, không
 * blacklist.
 */
describe('CustomerAvatarS3Service — chỉ nhận ảnh', () => {
  it.each(['application/pdf', 'text/html', 'application/octet-stream', 'image/svg+xml', ''])(
    'từ chối contentType %p',
    async (mime) => {
      await expect(mk().presignAvatar(7, 'x.bin', mime))
        .rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each(['image/jpeg', 'image/png', 'image/webp'])('nhận %p', async (mime) => {
    await expect(mk().presignAvatar(7, 'x.png', mime)).resolves.toBeDefined();
  });
});

describe('CustomerAvatarS3Service — key mang id chủ ảnh', () => {
  it('key nằm dưới tiền tố riêng của khách', async () => {
    const res = await mk().presignAvatar(7, 'anh.PNG', 'image/png');
    expect(res.key).toMatch(/^customer-avatars\/7\/[0-9a-f-]{36}\.png$/);
    expect(res.method).toBe('PUT');
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.publicUrl).toContain(res.key);
  });

  /** Đuôi file do client gửi, không được để nó đẻ ra path lạ. */
  it('đuôi file bậy bạ thì bỏ đi chứ không nhét vào key', async () => {
    const res = await mk().presignAvatar(7, 'x.../../../etc', 'image/png');
    expect(res.key).toMatch(/^customer-avatars\/7\/[0-9a-f-]{36}$/);
  });
});

/**
 * Khách chỉ đổi được ảnh CỦA MÌNH: id lấy từ phiên đăng nhập, và key phải nằm
 * đúng dưới tiền tố của id đó. Không có chốt này thì ai cũng ghi đè được avatar
 * người khác chỉ bằng cách gửi key của họ.
 */
describe('CustomerAvatarS3Service.publicUrlForOwnedKey', () => {
  it('key của khách khác thì từ chối', () => {
    expect(() => mk().publicUrlForOwnedKey(7, 'customer-avatars/8/'.concat('a'.repeat(36))))
      .toThrow(BadRequestException);
  });

  it('key sai hình dạng thì từ chối', () => {
    for (const bad of ['news/2026/01/x.png', '../../etc/passwd', 'customer-avatars/7/x.png', '']) {
      expect(() => mk().publicUrlForOwnedKey(7, bad)).toThrow(BadRequestException);
    }
  });

  it('key hợp lệ của chính mình thì trả URL công khai', async () => {
    const svc = mk();
    const { key, publicUrl } = await svc.presignAvatar(7, 'a.webp', 'image/webp');
    expect(svc.publicUrlForOwnedKey(7, key)).toBe(publicUrl);
  });
});
