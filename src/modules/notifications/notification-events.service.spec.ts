import { firstValueFrom, take, toArray } from 'rxjs';
import { NotifType } from '@/common/enums';
import { NotificationEvents } from './notification-events.service';

const row = (userId: number, title = 'Đơn mới') => ({
  userId,
  orderId: 12,
  type: NotifType.NEW_ORDER,
  title,
});

describe('NotificationEvents', () => {
  let events: NotificationEvents;

  beforeEach(() => {
    jest.useFakeTimers();
    events = new NotificationEvents();
  });

  afterEach(() => {
    events.onModuleDestroy();
    jest.useRealTimers();
  });

  it('đưa thông báo tới đúng người nhận', async () => {
    const received = firstValueFrom(events.streamFor(1).pipe(take(1)));
    events.emit([row(1)]);
    await expect(received).resolves.toMatchObject({
      data: { type: NotifType.NEW_ORDER, title: 'Đơn mới', orderId: 12 },
    });
  });

  /** Rò sang người khác ở đây là lộ dữ liệu đơn hàng, không chỉ là phiền. */
  it('KHÔNG đưa thông báo của người khác sang luồng của mình', async () => {
    const seen: unknown[] = [];
    const sub = events.streamFor(2).subscribe((e) => seen.push(e));
    events.emit([row(1), row(3)]);
    expect(seen).toEqual([]);
    sub.unsubscribe();
  });

  it('một lần emit nhiều người thì mỗi người nhận phần của mình', async () => {
    const first = firstValueFrom(events.streamFor(5).pipe(take(1)));
    const second = firstValueFrom(events.streamFor(6).pipe(take(1)));
    events.emit([row(5, 'của 5'), row(6, 'của 6')]);
    await expect(first).resolves.toMatchObject({ data: { title: 'của 5' } });
    await expect(second).resolves.toMatchObject({ data: { title: 'của 6' } });
  });

  /** Proxy cắt kết nối rỗng; nhịp tim cũng là cách FE biết đường truyền còn sống. */
  it('phát nhịp tim theo chu kỳ khi không có thông báo nào', async () => {
    const beats = firstValueFrom(events.streamFor(1).pipe(take(2), toArray()));
    jest.advanceTimersByTime(HEARTBEAT_MS * 2);
    const list = await beats;
    expect(list).toHaveLength(2);
    expect(list.every((e) => (e as { type?: string }).type === 'ping')).toBe(true);
  });

  it('emit mảng rỗng không phát gì', () => {
    const seen: unknown[] = [];
    const sub = events.streamFor(1).subscribe((e) => seen.push(e));
    events.emit([]);
    expect(seen).toEqual([]);
    sub.unsubscribe();
  });
});

const HEARTBEAT_MS = 25_000;
