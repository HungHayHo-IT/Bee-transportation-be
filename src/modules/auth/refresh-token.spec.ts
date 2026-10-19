import { UnauthorizedException } from '@nestjs/common';
import {
  REFRESH_TTL_DAYS, hashRefreshToken, newRefreshToken, refreshExpiresAt,
} from './refresh-token.helper';
import { RefreshTokenStore } from './refresh-token.store';

/**
 * Bảng refresh token giả, đủ giống Prisma delegate cho cái store cần dùng
 * (findUnique theo tokenHash, create, updateMany). Dùng bảng thật trong bộ nhớ
 * thay vì mockResolvedValue từng lượt, vì thứ đang kiểm là HIỆU ỨNG TÍCH LUỸ:
 * xoay vòng rồi dùng lại token cũ chỉ sai khi lần ghi trước đã đổi trạng thái.
 */
interface Row {
  id: number;
  /** Bản sao tiện đọc trong test; cột thật là userId/customerId, gắn kèm bên dưới. */
  ownerId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  [col: string]: unknown;
}

function mkTable(ownerField: 'userId' | 'customerId') {
  const rows: Row[] = [];
  let seq = 0;

  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row: Row = {
      id: (seq += 1),
      ownerId: data[ownerField] as number,
      [ownerField]: data[ownerField] as number,
      tokenHash: data.tokenHash as string,
      expiresAt: data.expiresAt as Date,
      revokedAt: null,
    };
    rows.push(row);
    return row;
  });

  const findUnique = jest.fn(async ({ where }: { where: { tokenHash: string } }) =>
    rows.find((r) => r.tokenHash === where.tokenHash) ?? null);

  const updateMany = jest.fn(async (
    { where, data }: { where: Record<string, unknown>; data: Record<string, unknown> },
  ) => {
    const hit = rows.filter((r) => {
      if (where.id !== undefined && r.id !== where.id) return false;
      if (where.tokenHash !== undefined && r.tokenHash !== where.tokenHash) return false;
      if (where[ownerField] !== undefined && r.ownerId !== where[ownerField]) return false;
      if (where.revokedAt === null && r.revokedAt !== null) return false;
      return true;
    });
    hit.forEach((r) => { r.revokedAt = data.revokedAt as Date; });
    return { count: hit.length };
  });

  const delegate = { create, findUnique, updateMany };
  return { rows, delegate, create, findUnique, updateMany };
}

function mkStore(ownerField: 'userId' | 'customerId' = 'userId') {
  const t = mkTable(ownerField);
  return { ...t, store: new RefreshTokenStore(t.delegate, ownerField) };
}

describe('refresh-token.helper — hàm thuần', () => {
  it('mỗi lần sinh ra một token khác nhau và đủ dài để không đoán được', () => {
    const a = newRefreshToken();
    const b = newRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('hash là hàm một chiều xác định: cùng token ra cùng hash, khác token ra khác', () => {
    const t = newRefreshToken();
    expect(hashRefreshToken(t)).toBe(hashRefreshToken(t));
    expect(hashRefreshToken(t)).not.toBe(hashRefreshToken(newRefreshToken()));
    expect(hashRefreshToken(t)).not.toContain(t);
  });

  it('hạn 30 ngày kể từ lúc cấp', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const exp = refreshExpiresAt(now);
    expect(REFRESH_TTL_DAYS).toBe(30);
    expect(exp.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('RefreshTokenStore — cấp, xoay vòng, thu hồi', () => {
  it('DB chỉ giữ hash, KHÔNG có token thô ở bất kỳ cột nào', async () => {
    const { store, rows, create } = mkStore();
    const raw = await store.issue(7);

    expect(rows[0].tokenHash).toBe(hashRefreshToken(raw));
    expect(JSON.stringify(create.mock.calls[0][0].data)).not.toContain(raw);
  });

  it('xoay vòng: cấp refresh mới và thu hồi cái vừa dùng', async () => {
    const { store, rows } = mkStore();
    const first = await store.issue(7);

    const out = await store.rotate(first);

    expect(out.ownerId).toBe(7);
    expect(out.refreshToken).not.toBe(first);
    expect(rows.find((r) => r.tokenHash === hashRefreshToken(first))?.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.tokenHash === hashRefreshToken(out.refreshToken))?.revokedAt)
      .toBeNull();
  });

  it('refresh mới cấp dùng được tiếp — chuỗi phiên không đứt', async () => {
    const { store } = mkStore();
    const a = await store.issue(7);
    const b = (await store.rotate(a)).refreshToken;
    await expect(store.rotate(b)).resolves.toMatchObject({ ownerId: 7 });
  });

  /**
   * Ca đáng sợ nhất: token đã xoay vòng mà còn xuất hiện lần nữa nghĩa là có
   * bản sao ở tay người khác. Không biết bản nào là của chủ thật, nên cắt sạch.
   */
  it('dùng lại refresh đã thu hồi thì từ chối VÀ thu hồi TOÀN BỘ của tài khoản đó', async () => {
    const { store, rows } = mkStore();
    const stolen = await store.issue(7);
    const fresh = (await store.rotate(stolen)).refreshToken;
    const other = await store.issue(7); // phiên thứ hai của cùng người, vd máy khác
    const outsider = await store.issue(99); // người khác, không được đụng tới

    await expect(store.rotate(stolen)).rejects.toBeInstanceOf(UnauthorizedException);

    const live = (raw: string) =>
      rows.find((r) => r.tokenHash === hashRefreshToken(raw))?.revokedAt === null;
    expect(live(fresh)).toBe(false);
    expect(live(other)).toBe(false);
    expect(live(outsider)).toBe(true);
  });

  it('refresh hết hạn thì từ chối', async () => {
    const { store } = mkStore();
    const old = new Date('2026-01-01T00:00:00Z');
    const raw = await store.issue(7, old);

    const sau31Ngay = new Date(old.getTime() + 31 * 24 * 60 * 60 * 1000);
    await expect(store.rotate(raw, sau31Ngay)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('hết hạn KHÔNG bị coi là bị trộm — không thu hồi các phiên còn sống khác', async () => {
    const { store, rows } = mkStore();
    const old = new Date('2026-01-01T00:00:00Z');
    const raw = await store.issue(7, old);
    const conSong = await store.issue(7, old);

    await expect(
      store.rotate(raw, new Date(old.getTime() + 31 * 24 * 60 * 60 * 1000)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rows.find((r) => r.tokenHash === hashRefreshToken(conSong))?.revokedAt).toBeNull();
  });

  it('token bịa ra / không có trong bảng thì từ chối', async () => {
    const { store } = mkStore();
    await expect(store.rotate(newRefreshToken())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /**
   * Nhân viên và khách là hai bảng tách rời, nên refresh của bên kia đơn giản
   * là không tồn tại ở bảng này. Đây chính là lý do không gộp một bảng chung.
   */
  it('refresh của chủ thể bên kia (khách <-> nhân viên) thì từ chối', async () => {
    const staff = mkStore('userId');
    const customer = mkStore('customerId');
    const cuaKhach = await customer.store.issue(7);

    await expect(staff.store.rotate(cuaKhach)).rejects.toBeInstanceOf(UnauthorizedException);
    // và phiên của khách vẫn còn nguyên, không bị lần thử kia làm hỏng
    await expect(customer.store.rotate(cuaKhach)).resolves.toMatchObject({ ownerId: 7 });
  });

  it('logout thu hồi đúng refresh của phiên đó, các phiên khác vẫn sống', async () => {
    const { store, rows } = mkStore();
    const mayA = await store.issue(7);
    const mayB = await store.issue(7);

    await store.revoke(mayA);

    expect(rows.find((r) => r.tokenHash === hashRefreshToken(mayA))?.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.tokenHash === hashRefreshToken(mayB))?.revokedAt).toBeNull();
    await expect(store.rotate(mayA)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout với token rác thì im lặng bỏ qua, không ném lỗi ra mặt người dùng', async () => {
    const { store } = mkStore();
    await expect(store.revoke('khong-ton-tai')).resolves.toBeUndefined();
    await expect(store.revoke(undefined)).resolves.toBeUndefined();
  });
});
