import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ServiceField } from '@prisma/client';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { hinhDangTuyen } from './hinh-dang-tuyen.helper';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateServiceFieldDto, ServiceFieldResponseDto, ServiceFormSchemaDto, UpdateServiceFieldDto,
} from './dto/service-field.dto';

/**
 * F1 mở rộng — mỗi dịch vụ tự khai bộ ô nhập của mình. Trước đây cả 10 dịch vụ dùng
 * chung một khối "Thông số hàng hóa", nên đơn hải quan phải nhìn ô "Thể tích (CBM)"
 * còn đơn cho thuê thiết bị không có chỗ nào ghi ngày thuê.
 */
@Injectable()
export class ServiceFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private toDto(f: ServiceField): ServiceFieldResponseDto {
    return {
      id: f.id,
      serviceId: f.serviceId,
      serviceChildId: f.serviceChildId,
      fieldKey: f.fieldKey,
      label: f.label,
      fieldType: f.fieldType,
      unit: f.unit,
      options: f.options,
      isRequired: f.isRequired,
      sortOrder: f.sortOrder,
      helpText: f.helpText,
      isActive: f.isActive,
    };
  }

  /** Một select không có lựa chọn nào render ra dropdown rỗng — không nhập được. */
  private assertOptions(fieldType: string | undefined, options: string[] | undefined): void {
    if (fieldType !== 'select') return;
    if (options === undefined || options.length === 0)
      throw new BadRequestException('Trường kiểu "select" phải có ít nhất một lựa chọn');
  }

  private async assertServiceExists(serviceId: number): Promise<void> {
    const exists = await this.prisma.service.findUnique({
      where: { id: serviceId }, select: { id: true },
    });
    if (!exists) throw new NotFoundException('Không tìm thấy dịch vụ');
  }

  /**
   * QA-30: tham số này CỐ Ý không có giá trị mặc định. Mặc định là "chỉ trường đang
   * dùng" từng khiến màn quản trị mất luôn trường vừa ngừng dùng — không còn id thì
   * không bật lại được. Bắt mỗi nơi gọi nói rõ ý định thì thêm một nơi gọi thứ ba
   * cũng không thể lặp lại lỗi đó.
   */
  /**
   * Ô nhập của một dịch vụ.
   *
   * `serviceChildId` đổi NGHĨA của câu trả lời, không chỉ lọc bớt:
   *   bỏ trống      -> MỌI ô của dịch vụ, kể cả ô riêng của từng dịch vụ con.
   *                    Màn quản trị cần thấy hết để sửa.
   *   có giá trị    -> ô CHUNG + ô riêng của đúng dịch vụ con đó. Đây là bộ ô
   *                    form tạo đơn phải dựng.
   */
  async list(
    serviceId: number,
    includeInactive: boolean,
    serviceChildId?: number,
  ): Promise<ServiceFieldResponseDto[]> {
    await this.assertServiceExists(serviceId);
    const rows = await this.prisma.serviceField.findMany({
      where: {
        serviceId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(serviceChildId === undefined
          ? {}
          : { OR: [{ serviceChildId: null }, { serviceChildId }] }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * Tất cả những gì form tạo đơn cần: ô hàng hóa nào hiện, hai đầu tuyến có
   * trong nước không, và bộ ô riêng.
   *
   * `serviceChildId` quyết định hình dạng tuyến: hàng xuất và hàng nhập nằm
   * cùng một dịch vụ cha nhưng ngược đầu nhau. Không truyền thì trả theo dịch
   * vụ cha, đúng như trước migration 054.
   */
  async schema(serviceId: number, serviceChildId?: number): Promise<ServiceFormSchemaDto> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        code: true,
        cargoFields: true,
        hasDomesticOrigin: true,
        hasDomesticDestination: true,
      },
    });
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');

    /* Đọc dịch vụ con qua CẢ serviceId: id của một dịch vụ khác truyền vào đây
       sẽ không khớp, và form rơi về cờ của dịch vụ cha thay vì lấy hình dạng
       tuyến của một dịch vụ không liên quan. */
    const con = serviceChildId === undefined ? null : await this.prisma.serviceChild.findFirst({
      where: { id: serviceChildId, serviceId },
      select: { hasDomesticOrigin: true, hasDomesticDestination: true },
    });
    const tuyen = hinhDangTuyen(service, con);
    return {
      serviceId: service.id,
      serviceCode: service.code,
      cargoFields: service.cargoFields,
      hasDomesticOrigin: tuyen.diTrongNuoc,
      hasDomesticDestination: tuyen.denTrongNuoc,
      // Form tạo đơn chỉ dựng ô cho trường đang dùng.
      fields: await this.list(serviceId, false, serviceChildId),
    };
  }

  async create(
    serviceId: number,
    dto: CreateServiceFieldDto,
    actor: AuthenticatedUser,
  ): Promise<ServiceFieldResponseDto> {
    await this.assertServiceExists(serviceId);
    this.assertOptions(dto.fieldType, dto.options);

    /* findFirst chu khong findUnique: tu 054 khoa chong trung la CHI MUC MOT
       PHAN o CSDL (mot cho tang chung, mot cho tang dich vu con) nen Prisma
       khong khai duoc bang @@unique. Cung tang moi tinh la trung - mot o chung
       va mot o cua dich vu con duoc phep mang cung khoa. */
    const clash = await this.prisma.serviceField.findFirst({
      where: {
        serviceId,
        fieldKey: dto.fieldKey,
        serviceChildId: dto.serviceChildId ?? null,
      },
    });
    if (clash)
      throw new ConflictException(
        `Dịch vụ này đã có trường "${dto.fieldKey}". Bật lại trường cũ thay vì tạo trùng.`,
      );

    const created = await this.prisma.serviceField.create({
      data: {
        serviceId,
        fieldKey: dto.fieldKey,
        label: dto.label,
        fieldType: dto.fieldType,
        unit: dto.unit,
        options: dto.options ?? [],
        isRequired: dto.isRequired ?? false,
        sortOrder: dto.sortOrder ?? 0,
        helpText: dto.helpText,
      },
    });
    await this.activity.log(null, {
      entity: 'service_fields', entityId: created.id, action: 'create', actorId: actor.id,
      detail: { serviceId, fieldKey: dto.fieldKey },
    });
    return this.toDto(created);
  }

  async update(
    fieldId: number,
    dto: UpdateServiceFieldDto,
    actor: AuthenticatedUser,
  ): Promise<ServiceFieldResponseDto> {
    const before = await this.prisma.serviceField.findUnique({ where: { id: fieldId } });
    if (!before) throw new NotFoundException('Không tìm thấy trường');

    // Đổi sang select mà body không kèm options thì phải có sẵn options cũ.
    const nextType = dto.fieldType ?? before.fieldType;
    this.assertOptions(nextType, dto.options ?? before.options);

    const updated = await this.prisma.serviceField.update({ where: { id: fieldId }, data: dto });
    await this.activity.log(null, {
      entity: 'service_fields', entityId: fieldId, action: 'update', actorId: actor.id,
      detail: { serviceId: before.serviceId, fieldKey: before.fieldKey, ...dto },
    });
    return this.toDto(updated);
  }

  /**
   * Xóa hẳn CHỈ khi chưa đơn nào nhập giá trị cho trường này; còn lại thì ngừng dùng.
   * Xóa một trường đang có dữ liệu là biến giá trị trong service_data thành mồ côi —
   * còn nằm đó nhưng không màn hình nào biết nhãn để hiển thị.
   */
  async remove(fieldId: number, actor: AuthenticatedUser): Promise<{ deleted: boolean; notice: string }> {
    const field = await this.prisma.serviceField.findUnique({ where: { id: fieldId } });
    if (!field) throw new NotFoundException('Không tìm thấy trường');

    // jsonb_exists() thay cho bộ lọc JSON của Prisma: ở đây câu hỏi là "khóa có mặt
    // hay không", không phải "giá trị bằng gì" — khóa mang giá trị null vẫn tính là đã nhập.
    const [{ used }] = await this.prisma.$queryRaw<{ used: number }[]>`
      SELECT count(*)::int AS used FROM orders
       WHERE service_id = ${field.serviceId} AND jsonb_exists(service_data, ${field.fieldKey})`;

    if (used > 0) {
      await this.update(fieldId, { isActive: false }, actor);
      return {
        deleted: false,
        notice: `${used} đơn đã nhập giá trị cho trường này nên chỉ ngừng dùng, không xóa. Đơn cũ giữ nguyên dữ liệu.`,
      };
    }

    await this.prisma.serviceField.delete({ where: { id: fieldId } });
    await this.activity.log(null, {
      entity: 'service_fields', entityId: fieldId, action: 'delete', actorId: actor.id,
      detail: { serviceId: field.serviceId, fieldKey: field.fieldKey },
    });
    return { deleted: true, notice: 'Đã xóa trường.' };
  }
}
