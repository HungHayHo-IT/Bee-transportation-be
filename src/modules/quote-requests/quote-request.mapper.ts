import { Prisma } from '@prisma/client';
import { PublicQuoteRequestDto, QuoteRequestDto } from './dto/quote-request.dto';
import { deriveSubmittedBy } from './submitted-by.helper';

/**
 * Quan hệ cần kéo kèm mỗi khi đọc quote_request để dựng được DTO đầy đủ.
 * Đặt cạnh hàm ánh xạ chứ không nằm trong service: hai thứ này phải đổi cùng
 * nhau — thêm trường vào DTO mà quên nới INCLUDE thì lỗi chỉ lộ ra lúc chạy.
 */
export const QUOTE_REQUEST_INCLUDE = {
  service: { select: { id: true, name: true } },
  creator: { select: { id: true, fullName: true } },
  reviewer: { select: { id: true, fullName: true } },
};

export type QuoteRequestRow = Prisma.QuoteRequestGetPayload<{
  include: typeof QUOTE_REQUEST_INCLUDE;
}>;

/** Hàm thuần, tách khỏi service để giữ file đó dưới mốc 300 dòng của repo. */
export function toQuoteRequestDto(r: QuoteRequestRow): QuoteRequestDto {
  return {
    id: r.id,
    customerName: r.customerName,
    phone: r.phone,
    email: r.email,
    serviceId: r.serviceId,
    serviceName: r.service?.name ?? null,
    originProvince: r.originProvince,
    destinationProvince: r.destinationProvince,
    note: r.note,
    status: r.status,
    createdById: r.createdBy,
    createdByName: r.creator?.fullName ?? null,
    submittedBy: deriveSubmittedBy(r.createdBy, r.customerId),
    createdAt: r.createdAt.toISOString(),
    reviewedById: r.reviewedBy,
    reviewedByName: r.reviewer?.fullName ?? null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    convertedToOrderId: r.convertedToOrderId,
    rejectReason: r.rejectReason,
  };
}

/**
 * Bản dựng cho đường tra cứu công khai. Viết tường minh từng trường chứ không
 * bóc-bỏ từ DTO đầy đủ (`delete dto.createdByName`): cách đó im lặng cho qua
 * mọi trường thêm vào sau này, và trường nội bộ mới sẽ tự động rò ra ngoài.
 */
export function toPublicQuoteRequestDto(r: QuoteRequestRow): PublicQuoteRequestDto {
  return {
    id: r.id,
    customerName: r.customerName,
    phone: r.phone,
    serviceId: r.serviceId,
    serviceName: r.service?.name ?? null,
    originProvince: r.originProvince,
    destinationProvince: r.destinationProvince,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    convertedToOrderId: r.convertedToOrderId,
    rejectReason: r.rejectReason,
  };
}
