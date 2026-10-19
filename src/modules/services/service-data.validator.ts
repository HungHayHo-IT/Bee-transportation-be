import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceField } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { CARGO_FIELD_KEYS, CARGO_FIELD_LABEL, CargoFieldKey } from '@/common/reference/cargo-fields';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 500;

/** Ô để trống không được lưu thành "" hay null — nó đơn giản là không có mặt. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Kiểm tra `serviceData` gửi lên có khớp bộ trường Admin đã cấu hình cho dịch vụ hay
 * không. Chạy ở tầng ứng dụng chứ không phải constraint DB: quy tắc đổi theo cấu hình
 * runtime, và thông báo lỗi phải gọi đúng tên trường mà sale nhìn thấy trên form.
 */
@Injectable()
export class ServiceDataValidator {
  constructor(private readonly prisma: PrismaService) {}

  private one(field: ServiceField, raw: unknown): string | number | boolean {
    const { label, fieldType } = field;

    if (fieldType === 'number') {
      const parsed = typeof raw === 'string' ? Number(raw) : raw;
      if (typeof parsed !== 'number' || !Number.isFinite(parsed))
        throw new BadRequestException(`"${label}" phải là số`);
      return parsed;
    }

    if (fieldType === 'boolean') {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'false') return raw === 'true';
      throw new BadRequestException(`"${label}" phải là true hoặc false`);
    }

    if (typeof raw !== 'string')
      throw new BadRequestException(`"${label}" phải là chuỗi ký tự`);
    const text = raw.trim();

    if (fieldType === 'date') {
      if (!ISO_DATE.test(text) || Number.isNaN(Date.parse(text)))
        throw new BadRequestException(`"${label}" phải là ngày theo định dạng YYYY-MM-DD`);
      return text;
    }

    if (fieldType === 'select') {
      if (!field.options.includes(text))
        throw new BadRequestException(
          `"${label}" chỉ nhận một trong: ${field.options.join(', ')}`,
        );
      return text;
    }

    if (text.length > MAX_TEXT)
      throw new BadRequestException(`"${label}" tối đa ${MAX_TEXT} ký tự`);
    return text;
  }

  /**
   * Trả về object đã chuẩn hóa để ghi thẳng vào cột jsonb. Khóa lạ bị TỪ CHỐI chứ
   * không lặng lẽ bỏ đi: gõ sai một khóa mà API vẫn trả 201 thì sale tưởng đã nhập.
   *
   * `skipRequired` bỏ qua DUY NHẤT bước đòi trường bắt buộc, dành cho đơn sinh từ
   * form báo giá công khai — form đó cố tình tối giản nên không bao giờ có "Thuê
   * từ ngày" hay "Loại hình tờ khai", vốn là thứ sale hỏi khách sau khi liên hệ.
   * Thà có đơn thiếu dữ liệu mà có người phụ trách, còn hơn yêu cầu nằm im ở
   * pending không ai biết. Mọi kiểm tra còn lại giữ nguyên.
   */
  async validate(
    serviceId: number,
    raw: Record<string, unknown>,
    opts?: { skipRequired?: boolean },
  ): Promise<Prisma.InputJsonObject> {
    const fields = await this.prisma.serviceField.findMany({
      where: { serviceId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const byKey = new Map(fields.map((f) => [f.fieldKey, f]));

    const unknown = Object.keys(raw).filter((k) => !byKey.has(k));
    if (unknown.length)
      throw new BadRequestException(
        `Dịch vụ này không có trường: ${unknown.join(', ')}. ` +
          'Xem GET /services/:id/form-schema để biết bộ trường hiện hành.',
      );

    const out: Record<string, string | number | boolean> = {};
    for (const field of fields) {
      const value = raw[field.fieldKey];
      if (isBlank(value)) {
        if (field.isRequired && !opts?.skipRequired)
          throw new BadRequestException(`"${field.label}" là bắt buộc`);
        continue;
      }
      out[field.fieldKey] = this.one(field, value);
    }
    return out as Prisma.InputJsonObject;
  }

  /**
   * Ô "Thông số hàng hóa" chung: từ chối giá trị của ô mà dịch vụ này không dùng.
   * Ghi bừa vào thì báo cáo đọc ra một con số không ai nhập, còn form thì không có
   * chỗ nào sửa lại được.
   */
  assertCargoAllowed(allowed: string[], payload: Record<string, unknown>): void {
    const sent = CARGO_FIELD_KEYS.filter((key) => !isBlank(payload[key]));
    const rejected = sent.filter((key) => !allowed.includes(key));
    if (rejected.length)
      throw new BadRequestException(
        `Dịch vụ này không dùng thông số: ${rejected
          .map((key) => CARGO_FIELD_LABEL[key as CargoFieldKey])
          .join(', ')}`,
      );
  }

  /** Đọc cấu hình một lần cho cả hai bước kiểm tra ở tầng đơn hàng. */
  async cargoFieldsOf(serviceId: number): Promise<string[]> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { cargoFields: true },
    });
    if (!service) throw new NotFoundException('Không tìm thấy dịch vụ');
    return service.cargoFields;
  }

  /**
   * Bộ trường bắt buộc của một dịch vụ, cho tầng đơn hàng chấm "đã đủ chưa".
   * Tách khỏi validate(): validate() NÉM khi thiếu, còn ở đây cần ĐẾM xem thiếu
   * những gì mà không làm hỏng request.
   *
   * Khai kiểu trả về tại chỗ thay vì import RequiredField từ module orders:
   * orders vốn đã import ServiceDataValidator, import ngược lại sẽ tạo vòng
   * giữa hai module. TypeScript khớp theo cấu trúc nên hai kiểu vẫn tương thích.
   */
  async requiredFieldsOf(serviceId: number): Promise<{ fieldKey: string; label: string }[]> {
    return this.prisma.serviceField.findMany({
      where: { serviceId, isActive: true, isRequired: true },
      select: { fieldKey: true, label: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
