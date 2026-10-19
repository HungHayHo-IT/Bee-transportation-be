import { Prisma } from '@prisma/client';

/**
 * Lát cắt "quy mô" của F6. Cắt theo KHỐI LƯỢNG — trong bốn trường số cố định thì
 * đây là trường sale điền nhiều nhất, và là trường duy nhất mọi dịch vụ có hàng
 * đều dùng. Thể tích và kích thước chỉ có ở một phần dịch vụ nên cắt theo chúng
 * sẽ dồn phần lớn đơn vào một nhóm "không rõ".
 *
 * Mốc chia bám theo tải trọng phương tiện quen thuộc: dưới 500 kg là hàng lẻ,
 * 2 tấn là xe tải nhỏ, 10 tấn là xe tải lớn, trên 25 tấn là đầu kéo / container.
 */
export interface SizeBucket {
  /** Khóa dùng cho drill; số để sắp xếp đúng thứ tự quy mô chứ không theo doanh thu. */
  key: string;
  label: string;
  /** kg, bao gồm cận dưới. */
  min: number | null;
  /** kg, KHÔNG bao gồm cận trên. */
  max: number | null;
}

/** Đơn chưa nhập khối lượng — đứng đầu để thấy ngay dữ liệu còn thiếu bao nhiêu. */
export const SIZE_UNKNOWN: SizeBucket = {
  key: '0',
  label: 'Chưa nhập khối lượng',
  min: null,
  max: null,
};

export const SIZE_BUCKETS: readonly SizeBucket[] = [
  { key: '1', label: 'Dưới 500 kg', min: null, max: 500 },
  { key: '2', label: '500 – 2.000 kg', min: 500, max: 2000 },
  { key: '3', label: '2.000 – 10.000 kg', min: 2000, max: 10000 },
  { key: '4', label: '10.000 – 25.000 kg', min: 10000, max: 25000 },
  { key: '5', label: 'Từ 25.000 kg', min: 25000, max: null },
];

export const ALL_SIZE_BUCKETS: readonly SizeBucket[] = [SIZE_UNKNOWN, ...SIZE_BUCKETS];

function condition(bucket: SizeBucket): Prisma.Sql {
  if (bucket.min === null) return Prisma.sql`o.weight_kg < ${bucket.max}::numeric`;
  if (bucket.max === null) return Prisma.sql`o.weight_kg >= ${bucket.min}::numeric`;
  return Prisma.sql`o.weight_kg >= ${bucket.min}::numeric AND o.weight_kg < ${bucket.max}::numeric`;
}

/**
 * Sinh biểu thức CASE từ chính mảng trên, để mốc chia chỉ tồn tại ở MỘT nơi —
 * biểu đồ và danh sách đơn phía sau nó không thể lệch nhau.
 */
export function sizeExpression(field: 'key' | 'label'): Prisma.Sql {
  const branches = SIZE_BUCKETS.map(
    (bucket) => Prisma.sql`WHEN ${condition(bucket)} THEN ${bucket[field]}::text`,
  );
  return Prisma.sql`CASE WHEN o.weight_kg IS NULL THEN ${SIZE_UNKNOWN[field]}::text
    ${Prisma.join(branches, ' ')} END`;
}

/** Điều kiện Prisma tương ứng một nhóm, dùng khi bấm vào cột để xem đơn phía sau. */
export function sizeWhere(key: string): Prisma.OrderWhereInput | null {
  if (key === SIZE_UNKNOWN.key) return { weightKg: null };
  const bucket = SIZE_BUCKETS.find((b) => b.key === key);
  if (!bucket) return null;
  return {
    weightKg: {
      ...(bucket.min === null ? {} : { gte: bucket.min }),
      ...(bucket.max === null ? {} : { lt: bucket.max }),
    },
  };
}
