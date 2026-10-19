import { OrderStatus } from '@/common/enums';

/**
 * Những trạng thái mà vòng giá còn mở, tính theo đúng nghĩa "chưa chốt giá".
 *
 * Gồm cả `awaiting_selection` — nhãn tiếng Việt của nó đọc là "Chờ chốt giá",
 * tức là giá chưa chốt thật. `closed` và `cancelled` đứng ngoài: vòng giá đã
 * đóng, thêm phòng vào chỉ làm bẩn dữ liệu.
 *
 * `awaiting_info` cũng đứng ngoài, nhưng vì lý do khác: đơn đó chưa phân phối
 * cho ai cả và sẽ tự chạy định tuyến khi có người điền nốt thông tin — lúc ấy
 * nó đọc ma trận mới nhất. Nhét phòng vào sớm là phát cho phòng ban một đơn còn
 * thiếu điểm đi lẫn điểm đến.
 */
export const BACKFILLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.DISTRIBUTED,
  OrderStatus.QUOTING,
  OrderStatus.AWAITING_SELECTION,
];

/**
 * Đúng phần Prisma mà hàm này đụng tới, khai riêng thay vì dùng thẳng `Tx`.
 *
 * Để test dựng được một tx giả bằng vài dòng — `Prisma.TransactionClient` kéo
 * theo toàn bộ bề mặt của client, giả lập nó là một bài tập vô ích. Chữ ký này
 * hẹp hơn client thật nên nơi gọi ép kiểu đúng một lần ở biên; đổi lại, hình
 * dạng câu truy vấn được khai ngay dưới đây và sai một tên cột là hỏng biên
 * dịch, chứ không phải là một `unknown` đi lọt tới lúc chạy.
 */
export interface RoutingTx {
  order: {
    findMany(args: {
      where: OrderFilter;
      select: { id: true; status: true };
    }): Promise<{ id: number; status: string }[]>;
    updateMany(args: {
      where: { id: { in: number[] } };
      data: { status: OrderStatus; updatedAt: Date };
    }): Promise<{ count: number }>;
  };
  orderDepartment: {
    createMany(args: {
      data: { orderId: number; departmentId: number }[];
    }): Promise<{ count: number }>;
  };
}

interface OrderFilter {
  serviceId: { in: number[] };
  status: { in: OrderStatus[] };
  departmentId: null;
  departments: { none: { departmentId: number } };
}

export interface RoutableDept {
  id: number;
  serviceIds: number[];
  isActive: boolean;
  /** Chỉ Phòng báo giá được chia đơn (080). */
  isQuoting: boolean;
}

/**
 * Cho một phòng vừa được trao quyền trên vài dịch vụ, kéo nốt những đơn CŨ còn
 * chưa chốt giá của các dịch vụ đó về phòng ấy.
 *
 * Vì sao cần: định tuyến vốn chỉ chạy đúng một lần, lúc tạo đơn. Sửa ma trận
 * xong thì phòng mới chỉ thấy đơn tạo SAU đó, còn cả loạt đơn đang nằm chờ báo
 * giá vẫn vô hình với họ — và không màn hình nào nói ra điều đó, nên người sửa
 * ma trận tin rằng mình vừa mở quyền xong xuôi.
 *
 * Ba lằn ranh, mỗi cái đều có lý do riêng:
 *
 * * `departmentId: null` — sale đã chọn được phòng thắng thì phần đấu giá coi
 *   như xong, chỉ còn chờ khách gật. Mời thêm một phòng vào lúc này là bảo họ
 *   báo một cái giá không bao giờ được chọn: selection.service chặn chọn lần hai.
 * * `departments: { none: ... }` — phòng đã có mặt trong đơn thì không thêm
 *   dòng thứ hai. Nhờ vậy gọi lại bao nhiêu lần cũng không sinh rác.
 * * Phòng ngừng hoạt động hoặc chưa phụ trách dịch vụ nào thì không nhận gì,
 *   đúng bằng điều kiện mà create() dùng khi phân phối đơn mới.
 *
 * Đơn `new` được kéo lên `distributed`: `new` nghĩa là chưa phòng nào nhận, mà
 * giờ đã có một phòng.
 *
 * KHÔNG bắn thông báo. Một lần sửa ma trận có thể chạm tới hàng chục đơn, và
 * dội ngần ấy email vào một phòng vừa được lập là cách nhanh nhất để họ tắt
 * thông báo. Đơn hiện ngay trong hàng đợi của phòng, đó là nơi họ nhìn.
 *
 * @returns id những đơn vừa được thêm phòng, để nơi gọi ghi vào nhật ký.
 */
export async function backfillOpenOrders(
  tx: RoutingTx,
  dept: RoutableDept,
): Promise<number[]> {
  if (!dept.isActive || !dept.isQuoting || dept.serviceIds.length === 0) return [];

  const orders = await tx.order.findMany({
    where: {
      serviceId: { in: dept.serviceIds },
      status: { in: BACKFILLABLE_STATUSES },
      departmentId: null,
      departments: { none: { departmentId: dept.id } },
    },
    select: { id: true, status: true },
  });
  if (!orders.length) return [];

  await tx.orderDepartment.createMany({
    data: orders.map((o) => ({ orderId: o.id, departmentId: dept.id })),
  });

  const fresh = orders.filter((o) => o.status === OrderStatus.NEW).map((o) => o.id);
  if (fresh.length)
    await tx.order.updateMany({
      where: { id: { in: fresh } },
      data: { status: OrderStatus.DISTRIBUTED, updatedAt: new Date() },
    });

  return orders.map((o) => o.id);
}
