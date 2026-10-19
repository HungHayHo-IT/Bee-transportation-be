import { LandingRefreshService } from './landing-refresh.service';

const cauHinh = (v: Record<string, string>) =>
  ({ get: (k: string) => v[k] }) as never;

describe('goi landing lam moi cache', () => {
  let goi: jest.Mock;

  beforeEach(() => {
    goi = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (globalThis as { fetch?: unknown }).fetch = goi;
  });

  /**
   * Thieu URL hoac thieu bi mat thi KHONG goi. Goi bua vao mot dia chi rong
   * la mot request hong o moi lan luu, va log day len nhung dong vo nghia.
   */
  it('chua cau hinh thi khong goi gi ca', async () => {
    await new LandingRefreshService(cauHinh({})).lamMoi('representatives');
    await new LandingRefreshService(cauHinh({ LANDING_URL: 'https://a.vn' }))
      .lamMoi('representatives');
    expect(goi).not.toHaveBeenCalled();
  });

  it('goi dung cua, mang bi mat trong header va the trong than', async () => {
    await new LandingRefreshService(
      cauHinh({ LANDING_URL: 'https://a.vn/', REVALIDATE_SECRET: 'bi-mat' }),
    ).lamMoi('representatives');

    expect(goi).toHaveBeenCalledTimes(1);
    const [url, opt] = goi.mock.calls[0] as [string, RequestInit];
    // Dau gach cuoi cua LANDING_URL phai duoc cat, neu khong thanh '//api'.
    expect(url).toBe('https://a.vn/api/revalidate');
    expect(opt.method).toBe('POST');
    expect((opt.headers as Record<string, string>)['x-revalidate-secret']).toBe('bi-mat');
    expect(JSON.parse(String(opt.body))).toEqual({ tag: 'representatives' });
  });

  /**
   * Landing chet hay mang hong deu KHONG duoc lam hong luot luu: du lieu da
   * nam trong CSDL roi, cung lam la hien cham. Nem loi ra la nguoi dung bam
   * Luu lan nua va tuong lan dau that bai.
   */
  it('landing loi thi nuot, khong nem ra ngoai', async () => {
    goi.mockRejectedValue(new Error('mat mang'));
    await expect(
      new LandingRefreshService(
        cauHinh({ LANDING_URL: 'https://a.vn', REVALIDATE_SECRET: 'bi-mat' }),
      ).lamMoi('representatives'),
    ).resolves.toBeUndefined();
  });
});
