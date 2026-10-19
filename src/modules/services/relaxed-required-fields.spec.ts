import { ServiceField } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { ServiceDataValidator } from './service-data.validator';

/**
 * Form báo giá công khai cố tình tối giản (tên, điện thoại, email, dịch vụ, lời
 * nhắn) nên không bao giờ thu được "Thuê từ ngày". Trước đây validator ném ở đó
 * và auto-convert chết, yêu cầu nằm im ở pending không ai nhìn thấy. Nới đúng
 * MỘT thứ — kiểm trường bắt buộc — và chỉ khi gọi từ nhánh nội bộ đó.
 */
function mk(fields: ServiceField[]) {
  const prisma = {
    serviceField: { findMany: jest.fn().mockResolvedValue(fields) },
  } as unknown as PrismaService;
  return new ServiceDataValidator(prisma);
}

const RENT_FROM = {
  id: 1, serviceId: 5, fieldKey: 'rent_from', label: 'Thuê từ ngày',
  fieldType: 'date', isRequired: true, options: [], sortOrder: 1, isActive: true,
} as unknown as ServiceField;

const NOTE = {
  id: 2, serviceId: 5, fieldKey: 'note', label: 'Ghi chú',
  fieldType: 'text', isRequired: false, options: [], sortOrder: 2, isActive: true,
} as unknown as ServiceField;

describe('validate — nới kiểm trường bắt buộc cho đơn từ form công khai', () => {
  it('thiếu trường bắt buộc mà nới thì trả về object rỗng, không ném', async () => {
    const out = await mk([RENT_FROM]).validate(5, {}, { skipRequired: true });
    expect(out).toEqual({});
  });

  it('không nới thì vẫn ném đúng tên trường sale nhìn thấy', async () => {
    await expect(mk([RENT_FROM]).validate(5, {})).rejects.toThrow('"Thuê từ ngày" là bắt buộc');
  });

  /** Gõ sai khóa mà vẫn 201 thì sale tưởng đã nhập — nới hay không cũng thế. */
  it('khóa lạ vẫn bị từ chối kể cả khi nới', async () => {
    await expect(
      mk([RENT_FROM]).validate(5, { rent_fromm: '2026-09-17' }, { skipRequired: true }),
    ).rejects.toThrow('không có trường: rent_fromm');
  });

  it('giá trị CÓ gửi vẫn bị kiểm kiểu kể cả khi nới', async () => {
    await expect(
      mk([RENT_FROM]).validate(5, { rent_from: '17/09/2026' }, { skipRequired: true }),
    ).rejects.toThrow('YYYY-MM-DD');
  });

  it('nới không làm mất dữ liệu của trường không bắt buộc có gửi lên', async () => {
    const out = await mk([RENT_FROM, NOTE]).validate(5, { note: ' giao gấp ' }, { skipRequired: true });
    expect(out).toEqual({ note: 'giao gấp' });
  });
});
