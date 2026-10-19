import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(8080),

  // Múi giờ quyết định current_date -> ngày trong mã đơn. Xem README.
  TZ: Joi.string().default('Asia/Ho_Chi_Minh'),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('12h'),
  COOKIE_SECRET: Joi.string().min(32).required(),
  COOKIE_SECURE: Joi.boolean().default(true),

  // QA-13 cho phép nhiều origin ngăn cách bằng dấu phẩy (main.ts tách chuỗi này),
  // nhưng schema vẫn đòi đúng một URI nên `.env.example` không khởi động nổi.
  // Validate từng phần tử của danh sách thay vì cả chuỗi.
  FRONTEND_ORIGIN: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      const origins = value.split(',').map((o) => o.trim());
      if (origins.length === 0 || origins.some((o) => Joi.string().uri().validate(o).error))
        return helpers.error('any.invalid');
      return value;
    }, 'danh sách origin ngăn cách bằng dấu phẩy')
    .messages({ 'any.invalid': 'phải là một hoặc nhiều URI ngăn cách bằng dấu phẩy' }),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  // Khong khai thi suy theo cong: 465 la TLS ngam, 587 la STARTTLS.
  SMTP_SECURE: Joi.boolean().optional(),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  SMTP_FROM: Joi.string().required(),

  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_FILE_SIZE_MB: Joi.number().default(20),

  // S3 (tuỳ chọn) — có đủ 4 giá trị ACCESS_KEY_ID + SECRET + BUCKET + REGION
  // thì NewsImagesService dùng presigned URL. Thiếu thì rơi về ghi đĩa.
  S3_ENDPOINT: Joi.string().uri().optional().allow(''),
  S3_REGION: Joi.string().optional().allow(''),
  S3_BUCKET: Joi.string().optional().allow(''),
  S3_ACCESS_KEY_ID: Joi.string().optional().allow(''),
  S3_SECRET_ACCESS_KEY: Joi.string().optional().allow(''),
  // CDN / URL công khai để trả về cho FE. Trống thì compose từ endpoint+bucket.
  S3_PUBLIC_URL_BASE: Joi.string().uri().optional().allow(''),
  // Thời hạn presigned URL — mặc định 5 phút, đủ để browser gửi xong file.
  /* Địa chỉ trang ký bên landing, dùng để dựng link gửi khách. Không có thì
     luồng ký từ chối ngay thay vì gửi một đường dẫn trỏ vào hư không. */
  SIGN_PAGE_URL: Joi.string().uri().optional().allow(''),

  S3_PRESIGN_EXPIRES: Joi.number().default(300),

  // Google Sign-In cho tài khoản khách hàng. Client ID lấy từ Google Cloud
  // Console → OAuth 2.0. Trống => endpoint /customer-auth/google trả 501.
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),

  // Firebase Admin cho push FCM tới khách hàng. Dán nguyên nội dung file service
  // account JSON vào một biến. Trống => FcmService no-op, app vẫn chạy bình thường
  // (máy dev không cần credential).
  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().optional().allow(''),

  SLA_CHECK_CRON: Joi.string().default('*/15 * * * *'),
  MAIL_FLUSH_CRON: Joi.string().default('*/2 * * * *'),
  QUOTE_EXPIRY_CRON: Joi.string().default('0 * * * *'),
  PUSH_FLUSH_CRON: Joi.string().default('*/30 * * * * *'),
  FILE_CLEANUP_CRON: Joi.string().default('0 3 * * *'),

  // Bỏ qua khi chạy test: DB_PASSWORD chỉ docker-compose dùng
  DB_PASSWORD: Joi.string().optional(),
}).unknown(true);
