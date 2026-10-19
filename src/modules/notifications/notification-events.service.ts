import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, filter, map, merge, interval } from 'rxjs';
import { NotifType } from '@/common/enums';

/** Nhịp tim: proxy trung gian cắt kết nối không có dữ liệu. */
export const HEARTBEAT_MS = 25_000;

export interface NotificationEvent {
  userId: number;
  type: NotifType;
  title: string;
  orderId?: number | null;
}

/** Khung SSE Nest gửi đi. `type` vắng mặt = sự kiện `message` mặc định. */
export interface StreamFrame {
  data: unknown;
  type?: string;
}

/**
 * Bus sự kiện TRONG BỘ NHỚ của một tiến trình.
 *
 * CHỈ ĐÚNG KHI CHẠY MỘT INSTANCE API — đúng hiện trạng docker-compose.prod.yml.
 * Chạy nhiều replica thì người dùng nối vào replica A sẽ không thấy sự kiện phát
 * từ replica B, và lỗi này im lặng: hộp thư vẫn đúng, chỉ realtime là mất. Muốn
 * scale thì thay ruột bằng Postgres LISTEN/NOTIFY, giữ nguyên hai phương thức
 * công khai bên dưới.
 */
@Injectable()
export class NotificationEvents implements OnModuleDestroy {
  private readonly stream = new Subject<NotificationEvent>();

  emit(rows: NotificationEvent[]): void {
    for (const row of rows) this.stream.next(row);
  }

  /** Luồng SSE của riêng một người: thông báo của họ, xen nhịp tim. */
  streamFor(userId: number): Observable<StreamFrame> {
    const mine = this.stream.pipe(
      filter((e) => e.userId === userId),
      map((e): StreamFrame => ({
        data: { type: e.type, title: e.title, orderId: e.orderId ?? null },
      })),
    );
    // data KHÔNG được rỗng: theo chuẩn SSE, khung không có dòng `data:` bị trình
    // duyệt bỏ qua hoàn toàn. Vẫn giữ tên `ping` để nó không rơi vào onmessage.
    const beat = interval(HEARTBEAT_MS).pipe(
      map((): StreamFrame => ({ type: 'ping', data: 'ping' })),
    );
    return merge(mine, beat);
  }

  onModuleDestroy(): void {
    this.stream.complete();
  }
}
