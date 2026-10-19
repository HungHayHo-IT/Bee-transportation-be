import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { MustChangePasswordGuard } from './common/guards/must-change-password.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PageAccessGuard } from './common/permissions/page-access.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { wrapOpenApiInEnvelope } from './common/swagger/envelope-openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy = 1 (ĐÚNG MỘT HOP), không phải `true`. Caddy APPEND vào
    // X-Forwarded-For, nên tin tất cả thì Fastify lấy phần tử TRÁI NHẤT — chính
    // là giá trị client tự gửi — và ai cũng giả được IP để vượt rate limit.
    // Tin một hop thì lấy đúng IP mà Caddy nhìn thấy.
    //
    // An toàn vì `api` không publish cổng nào trong docker-compose.prod.yml:
    // đường vào duy nhất là qua Caddy. Nếu sau này expose cổng app ra ngoài thì
    // PHẢI xem lại dòng này.
    new FastifyAdapter({ logger: false, bodyLimit: 25 * 1024 * 1024, trustProxy: 1 }),
    // Tắt parser mặc định của Nest để đăng ký parser riêng bên dưới; để bật thì
    // Fastify ném FST_ERR_CTP_ALREADY_PRESENT ngay lúc khởi động.
    { bodyParser: false },
  );

  await app.register(fastifyCookie, { secret: process.env.COOKIE_SECRET });
  await app.register(fastifyMultipart, {
    limits: { fileSize: Number(process.env.MAX_FILE_SIZE_MB ?? 20) * 1024 * 1024 },
  });

  // POST không body nhưng vẫn gửi Content-Type: application/json là chuyện bình thường
  // từ phía FE. Mặc định Fastify ném FastifyError -> lọt ra thành 500. Coi body rỗng
  // là {}, và JSON hỏng là 400 chứ không phải 500.
  app.getHttpAdapter().getInstance().addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req: unknown, body: string, done: (err: Error | null, value?: unknown) => void) => {
      if (!body) return done(null, {});
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return done(new BadRequestException('Body không phải JSON hợp lệ'));
      }
      // "chuoi" / 123 / true là JSON hợp lệ nhưng không phải body hợp lệ —
      // ValidationPipe sẽ lặng lẽ biến chúng thành {} và request đi tiếp.
      if (parsed === null || typeof parsed !== 'object')
        return done(new BadRequestException('Body phải là một đối tượng JSON'));
      done(null, parsed);
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );

  // QA-13: một origin duy nhất không đủ — dev chạy :5173, staging và production là
  // hai tên miền khác. Nhận danh sách ngăn cách bằng dấu phẩy.
  const origins = (process.env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
  app.enableCors({ origin: origins.length ? origins : false, credentials: true });
  app.enableShutdownHooks();

  // createDocument() chỉ thấy DTO mà controller khai, không thấy vỏ do
  // TransformInterceptor/HttpExceptionFilter dựng lúc chạy. Bọc lại ở đây để spec
  // phát ra đúng thứ client thật sự nhận. Gọi TRƯỚC setGlobalPrefix('api') nên
  // đường dẫn trong tài liệu chưa có tiền tố /api — danh sách @SkipEnvelope bên
  // trong hàm viết theo đúng dạng đó.
  const doc = wrapOpenApiInEnvelope(SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('BeeOps — Internal Operations API')
      .setDescription('Web vận hành nội bộ Bee Transportation Corporation')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .addServer('/api')
      .build(),
  ));
  SwaggerModule.setup('api/docs', app, doc);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformInterceptor(reflector));
  app.useGlobalGuards(
    new JwtAuthGuard(reflector),
    new RolesGuard(reflector),
    new MustChangePasswordGuard(reflector),
    /* Ma trận phân quyền, chạy SAU RolesGuard: hai lớp cùng chặn, và endpoint
       chưa khai trang thì lớp này không đụng tới. Lấy từ container chứ không
       `new` như ba cái trên vì nó cần PrismaService. */
    app.get(PageAccessGuard),
  );

  const port = parseInt(process.env.PORT ?? '8080', 10);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[BeeOps] http://localhost:${port}/api  ·  docs: /api/docs`);
}

void bootstrap();
