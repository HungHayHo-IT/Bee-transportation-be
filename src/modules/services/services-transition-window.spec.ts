import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { ACCESS_COOKIE } from '@/common/strategies/jwt.strategy';
import { extractStaffToken } from '@/common/auth/staff-token.helper';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

const jwt = new JwtService({ secret: 'test-secret' });
const config = { getOrThrow: () => 'test-secret' } as unknown as ConfigService;

const FULL = [{
  id: 1, code: 'DOM', name: 'Vận chuyển nội địa', sortOrder: 3,
  cargoFields: ['weightKg'], slaHours: 24, milestones: ['A'],
  departmentIds: [2, 5], isActive: true,
}];
const NARROW = [{ id: 1, code: 'DOM', name: 'Vận chuyển nội địa', sortOrder: 3, cargoFields: ['weightKg'] }];

function mk(laNhanVienThat = true) {
  const list = jest.fn().mockResolvedValue(FULL);
  const listPublic = jest.fn().mockResolvedValue(NARROW);
  const laNhanVien = jest.fn().mockResolvedValue(laNhanVienThat);
  const ctl = new ServicesController(
    { list, listPublic, laNhanVien } as unknown as ServicesService, jwt, config,
  );
  return { ctl, list, listPublic, laNhanVien };
}

const req = (cookie?: string, bearer?: string) => ({
  cookies: cookie ? { [ACCESS_COOKIE]: cookie } : {},
  headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
});

describe('extractStaffToken — lấy token thô từ request', () => {
  it('đọc được từ cookie', () => {
    expect(extractStaffToken(req('abc'))).toBe('abc');
  });

  it('đọc được từ header Authorization: Bearer', () => {
    expect(extractStaffToken(req(undefined, 'xyz'))).toBe('xyz');
  });

  /** Cookie là đường của trình duyệt, ưu tiên nó cho khớp thứ tự ở JwtStrategy. */
  it('có cả hai thì cookie thắng', () => {
    expect(extractStaffToken(req('abc', 'xyz'))).toBe('abc');
  });

  it('không có gì thì trả null, không ném', () => {
    expect(extractStaffToken(req())).toBeNull();
  });

  it('header sai định dạng thì bỏ qua', () => {
    expect(extractStaffToken({ cookies: {}, headers: { authorization: 'Basic abc' } })).toBeNull();
  });
});

/**
 * Cửa sổ chuyển tiếp: /services vẫn mở công khai để app mobile đang gọi nó
 * không gãy, nhưng người chưa đăng nhập chỉ nhận bản rút gọn. Rò rỉ thật nằm ở
 * các TRƯỜNG thừa (departmentIds = sơ đồ phòng ban, slaHours, milestones),
 * không nằm ở chuyện endpoint công khai — nên bịt trường là đủ.
 */
describe('GET /services — nhìn người mà trả', () => {
  it('vẫn còn @Public(), không khoá lại ngay', () => {
    const isPublic = new Reflector().get<boolean>(IS_PUBLIC_KEY, ServicesController.prototype.list);
    expect(isPublic).toBe(true);
  });

  it('không có token: trả bản rút gọn, không lộ trường nội bộ', async () => {
    const { ctl, list, listPublic } = mk();
    const res = await ctl.list(req());
    expect(listPublic).toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(Object.keys(res.items[0])).not.toContain('departmentIds');
    expect(Object.keys(res.items[0])).not.toContain('slaHours');
    expect(Object.keys(res.items[0])).not.toContain('milestones');
  });

  it('nhân viên có token hợp lệ: trả bản đầy đủ', async () => {
    const { ctl, list } = mk();
    const token = await jwt.signAsync({ sub: 7 });
    const res = await ctl.list(req(token));
    expect(list).toHaveBeenCalled();
    expect(Object.keys(res.items[0])).toContain('departmentIds');
  });

  it('token qua header Bearer cũng được coi là nhân viên', async () => {
    const { ctl, list } = mk();
    const token = await jwt.signAsync({ sub: 7 });
    await ctl.list(req(undefined, token));
    expect(list).toHaveBeenCalled();
  });

  /** Token của KHÁCH không phải token nhân viên — không được mở dữ liệu nội bộ. */
  it('token khách hàng vẫn chỉ nhận bản rút gọn', async () => {
    const { ctl, list, listPublic } = mk();
    const token = await jwt.signAsync({ sub: 7, type: 'customer' });
    await ctl.list(req(token));
    expect(listPublic).toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('token rác thì coi như chưa đăng nhập, không ném lỗi', async () => {
    const { ctl, listPublic } = mk();
    await expect(ctl.list(req('khong-phai-jwt'))).resolves.toBeDefined();
    expect(listPublic).toHaveBeenCalled();
  });

  it('token hết hạn cũng coi như chưa đăng nhập', async () => {
    const { ctl, listPublic } = mk();
    const expired = await jwt.signAsync({ sub: 7 }, { expiresIn: '-1s' });
    await ctl.list(req(expired));
    expect(listPublic).toHaveBeenCalled();
  });
});

/**
 * Vai trò `partner` là người của công ty ĐỐI TÁC. Họ có token hợp lệ của hệ
 * nhân viên, nên `type !== 'customer'` không đủ để phân biệt — và ma trận cho
 * họ `none` ở trang Dịch vụ.
 *
 * Đã rò thật: đối tác gọi GET /services nhận được slaHours, milestones và
 * departmentIds, tức là SLA nội bộ cùng sơ đồ phòng ban nào phụ trách dịch vụ
 * nào. API nói ngược lại ma trận.
 */
describe('đối tác KHÔNG được coi là nhân viên ở cửa sổ chuyển tiếp', () => {
  it('token hợp lệ nhưng vai trò partner thì nhận bản RÚT GỌN', async () => {
    const { ctl, list, listPublic, laNhanVien } = mk(false);
    const token = await jwt.signAsync({ sub: 7 }, { secret: 'test-secret' });
    const kq = await ctl.list(req(token));

    expect(laNhanVien).toHaveBeenCalledWith(7);
    expect(listPublic).toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    for (const cam of ['slaHours', 'milestones', 'departmentIds', 'isActive']) {
      expect(Object.keys(kq.items[0])).not.toContain(cam);
    }
  });

  it('nhân viên thật vẫn nhận bản đầy đủ', async () => {
    const { ctl, list, listPublic } = mk(true);
    const token = await jwt.signAsync({ sub: 7 }, { secret: 'test-secret' });
    await ctl.list(req(token));

    expect(list).toHaveBeenCalled();
    expect(listPublic).not.toHaveBeenCalled();
  });
});
