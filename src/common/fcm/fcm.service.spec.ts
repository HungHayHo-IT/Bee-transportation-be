import { ConfigService } from '@nestjs/config';
import { FcmService } from './fcm.service';

const mockSendEachForMulticast = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  messaging: () => ({ sendEachForMulticast: mockSendEachForMulticast }),
}));

const CRED = JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'k' });

const mkConfig = (json: string): ConfigService =>
  ({ get: () => json }) as unknown as ConfigService;

const MSG = { title: 'Báo giá đã có', body: '12.500.000đ', data: { orderId: '7' } };

describe('FcmService khi chưa cấu hình credential', () => {
  it('isEnabled = false và sendEach không gọi Firebase', async () => {
    const svc = new FcmService(mkConfig(''));
    expect(svc.isEnabled).toBe(false);
    const res = await svc.sendEach(['tok-a'], MSG);
    expect(res).toEqual({ ok: [], dead: [] });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });
});

describe('FcmService.sendEach', () => {
  beforeEach(() => mockSendEachForMulticast.mockReset());

  it('tách token sống và token chết theo mã lỗi của Firebase', async () => {
    mockSendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/invalid-argument' } },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    const svc = new FcmService(mkConfig(CRED));
    const res = await svc.sendEach(['a', 'b', 'c', 'd'], MSG);
    expect(res.ok).toEqual(['a']);
    expect(res.dead.sort()).toEqual(['b', 'c']);
  });

  /**
   * 'messaging/internal-error' là lỗi TẠM THỜI của Firebase. Xếp nó vào dead là
   * tự xoá token còn sống của khách — lần sau họ không nhận được gì nữa.
   */
  it('lỗi tạm thời KHÔNG bị coi là token chết', async () => {
    mockSendEachForMulticast.mockResolvedValue({
      responses: [{ success: false, error: { code: 'messaging/server-unavailable' } }],
    });
    const svc = new FcmService(mkConfig(CRED));
    expect((await svc.sendEach(['a'], MSG)).dead).toEqual([]);
  });

  it('mảng token rỗng thì không gọi Firebase', async () => {
    const svc = new FcmService(mkConfig(CRED));
    await svc.sendEach([], MSG);
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  /** sendEachForMulticast giới hạn 500 token mỗi lần gọi. */
  it('chia lô 500 token', async () => {
    mockSendEachForMulticast.mockImplementation(({ tokens }: { tokens: string[] }) =>
      Promise.resolve({ responses: tokens.map(() => ({ success: true })) }),
    );
    const svc = new FcmService(mkConfig(CRED));
    const many = Array.from({ length: 501 }, (_, i) => `tok-${i}`);
    const res = await svc.sendEach(many, MSG);
    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(res.ok).toHaveLength(501);
  });

  it('Firebase ném lỗi thì nuốt, trả kết quả rỗng — không làm hỏng cron', async () => {
    mockSendEachForMulticast.mockRejectedValue(new Error('network down'));
    const svc = new FcmService(mkConfig(CRED));
    await expect(svc.sendEach(['a'], MSG)).resolves.toEqual({ ok: [], dead: [] });
  });
});
