import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface FcmMessage {
  title: string;
  body: string;
  /** Payload FE dùng để điều hướng. Giá trị PHẢI là chuỗi — FCM không nhận kiểu khác. */
  data: Record<string, string>;
}

export interface FcmResult {
  ok: string[];
  /** Token Firebase khẳng định không còn tồn tại — người gọi phải xoá khỏi DB. */
  dead: string[];
}

/** Giới hạn cứng của sendEachForMulticast. */
const BATCH = 500;

/**
 * Chỉ hai mã này nghĩa là token thật sự chết. Mọi mã khác (internal-error,
 * server-unavailable, quota-exceeded...) là lỗi TẠM THỜI — xếp chúng vào `dead`
 * là tự tay xoá token còn sống của khách.
 */
const DEAD_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

/**
 * Bọc firebase-admin. Đặt ở common/ chứ không nhét trong customer-auth/: khi nào
 * muốn bắn push cho nhân viên thì chỉ thêm bảng thiết bị, không phải gỡ service
 * ra khỏi module khách.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  readonly isEnabled: boolean;

  constructor(config: ConfigService) {
    const raw = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '';
    if (!raw) {
      this.isEnabled = false;
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON trống — push FCM tắt, app vẫn chạy');
      return;
    }
    try {
      if (!admin.apps.length)
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(raw) as admin.ServiceAccount),
        });
      this.isEnabled = true;
    } catch (e) {
      // Credential hỏng không được làm app chết lúc khởi động — push là việc phụ.
      this.isEnabled = false;
      this.logger.error({ err: e }, 'Credential Firebase không đọc được — push FCM tắt');
    }
  }

  async sendEach(tokens: string[], msg: FcmMessage): Promise<FcmResult> {
    if (!this.isEnabled || tokens.length === 0) return { ok: [], dead: [] };
    const ok: string[] = [];
    const dead: string[] = [];

    for (let i = 0; i < tokens.length; i += BATCH) {
      const lot = tokens.slice(i, i + BATCH);
      try {
        const res = await admin.messaging().sendEachForMulticast({
          tokens: lot,
          notification: { title: msg.title, body: msg.body },
          data: msg.data,
        });
        res.responses.forEach((r, idx) => {
          if (r.success) ok.push(lot[idx]);
          else if (r.error && DEAD_CODES.has(r.error.code)) dead.push(lot[idx]);
        });
      } catch (e) {
        // Cả lô hỏng: coi như chưa gửi, KHÔNG đánh dấu token nào là chết.
        this.logger.error({ err: e, count: lot.length }, 'Gọi FCM thất bại');
      }
    }
    return { ok, dead };
  }
}
