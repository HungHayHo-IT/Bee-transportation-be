import { PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

const isPublic = (handler: unknown) => Reflect.getMetadata(IS_PUBLIC_KEY, handler as object);

/**
 * Danh mục cho khách vãng lai đi bằng một endpoint riêng, không phải bằng cách
 * lọc bớt trường của ServiceResponseDto theo trạng thái đăng nhập. Lý do: mai
 * sau ai thêm trường mới vào DTO đầy đủ cũng không vô tình công khai nó — DTO
 * đầy đủ vẫn nằm sau guard, đường công khai có DTO riêng phải sửa mới nở ra.
 */
describe('Đường công khai riêng cho danh mục dịch vụ', () => {
  it('GET /services/public mở cho khách chưa đăng nhập', () => {
    expect(isPublic(ServicesController.prototype.listPublic)).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, ServicesController.prototype.listPublic)).toBe(
      'public',
    );
  });

  /**
   * CỬA SỔ CHUYỂN TIẾP: /services vẫn mở công khai để client đang gọi nó không
   * gãy. Rò rỉ được bịt bằng cách lọc TRƯỜNG chứ không bằng cách khoá cửa —
   * người chưa đăng nhập nhận đúng bản rút gọn. Xem services-transition-window
   * .spec.ts để biết luật nhìn-người-mà-trả.
   *
   * Khi app mobile đã chuyển hẳn sang /services/public thì đổi test này thành
   * `toBeUndefined()` và bỏ @Public() ở handler.
   */
  it('GET /services tạm thời vẫn @Public() trong cửa sổ chuyển tiếp', () => {
    expect(isPublic(ServicesController.prototype.list)).toBe(true);
  });

  /**
   * NestJS khớp route theo thứ tự khai báo: nếu có @Get(':id') đứng trước thì
   * 'public' sẽ bị nuốt làm tham số id.
   */
  it("'public' khai báo trước mọi route GET có tham số", () => {
    const methods = Object.getOwnPropertyNames(ServicesController.prototype);
    const paths = methods.map(
      (m) =>
        Reflect.getMetadata(
          PATH_METADATA,
          (ServicesController.prototype as unknown as Record<string, unknown>)[m] as object,
        ) as string | undefined,
    );
    const publicIdx = paths.indexOf('public');
    expect(publicIdx).toBeGreaterThan(-1);
    const paramIdx = paths.findIndex((p) => typeof p === 'string' && p.includes(':'));
    if (paramIdx > -1) expect(publicIdx).toBeLessThan(paramIdx);
  });
});

describe('ServicesService.listPublic', () => {
  const rows = [
    {
      id: 1, code: 'DOM', name: 'Nội địa', slaHours: 24, milestones: ['Nhận hàng', 'Nghiệm thu'],
      sortOrder: 1, isActive: true, cargoFields: ['weightKg'],
      hasDomesticDestination: true,
      children: [{ id: 7, name: 'Nội địa nguyên container (FCL)', tmsMode: 'DOMESTIC_FCL' }],
    },
    {
      id: 2, code: 'OLD', name: 'Dịch vụ đã tắt', slaHours: 48, milestones: ['Nghiệm thu'],
      sortOrder: 2, isActive: false, cargoFields: [],
      hasDomesticDestination: true, children: [],
    },
  ];

  const build = () => {
    const findMany = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(rows.filter((r) => (where?.isActive === undefined ? true : r.isActive === where.isActive))),
    );
    const svc = new ServicesService({ service: { findMany } } as never, {} as never, {} as never, {} as never);
    return { svc, findMany };
  };

  it('chỉ trả dịch vụ đang bật', async () => {
    const { svc, findMany } = build();
    const items = await svc.listPublic();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(items.map((i) => i.code)).toEqual(['DOM']);
  });

  it('không kèm trường nội bộ nào', async () => {
    const { svc } = build();
    const [item] = await svc.listPublic();
    expect(Object.keys(item).sort()).toEqual(
      ['cargoFields', 'children', 'code', 'formFields', 'id', 'name', 'sortOrder'],
    );
  });

  // App dung form tu mang nay. Thieu dich vu con la yeu cau gui len khong tu
  // thanh don duoc, no nam im o `pending` va khong ai nhin thay.
  it('kèm dịch vụ con đang bật và mảng config các ô của form', async () => {
    const { svc } = build();
    const [item] = await svc.listPublic();
    expect(item.children).toEqual([
      { id: 7, name: 'Nội địa nguyên container (FCL)', tmsMode: 'DOMESTIC_FCL' },
    ]);
    expect(item.formFields.filter((o) => o.required).map((o) => o.key))
      .toEqual(['customerName', 'phone', 'serviceChildId', 'originProvince', 'destinationProvince']);
  });

  it('chỉ lấy dịch vụ con ĐANG BẬT', async () => {
    const { svc, findMany } = build();
    await svc.listPublic();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { children: expect.objectContaining({ where: { isActive: true } }) },
    }));
  });

  /** Không được chạm bảng department: sơ đồ phòng ban là thứ đang phải giấu. */
  it('không tra cứu phòng ban phụ trách', async () => {
    const deptFindMany = jest.fn();
    const svc = new ServicesService(
      {
        service: { findMany: jest.fn().mockResolvedValue([rows[0]]) },
        department: { findMany: deptFindMany },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await svc.listPublic();
    expect(deptFindMany).not.toHaveBeenCalled();
  });
});
