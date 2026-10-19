import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

/** Prisma P2002 — không import type của Prisma để filter không phụ thuộc ORM. */
interface UniqueViolation {
  code: 'P2002';
  meta?: { target?: unknown };
}

function isUniqueViolation(e: unknown): e is UniqueViolation {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const res = http.getResponse<FastifyReply>();

    // Vi phạm ràng buộc duy nhất là LỖI CỦA NGƯỜI GỬI (trùng tên phòng, trùng email),
    // không phải sự cố hệ thống — để rơi vào nhánh 500 thì client không phân biệt được
    // với lỗi thật, và log đầy stack trace vô nghĩa.
    if (isUniqueViolation(exception)) {
      const fields = (exception.meta?.target as string[] | undefined)?.join(', ');
      void res.status(HttpStatus.CONFLICT).send({
        success: false,
        error: {
          code: 'ConflictException',
          message: fields ? `Giá trị của "${fields}" đã tồn tại` : 'Giá trị đã tồn tại',
          statusCode: HttpStatus.CONFLICT,
          ...(fields ? { details: { fields } } : {}),
        },
        meta: { timestamp: new Date().toISOString(), path: req.url },
      });
      return;
    }

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Lỗi hệ thống';
    let code = 'Internal Server Error';
    // Dữ liệu kèm theo lỗi (ví dụ existingCustomerId của 409 trùng tên khách). Không
    // có chỗ này thì mọi trường ngoài `message` bị nuốt mất và client chỉ còn câu chữ
    // để phân tích — đúng thứ không nên bắt client làm.
    let details: Record<string, unknown> | undefined;
    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[]; error?: string };
        message = Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? exception.message);
        code = b.error ?? exception.name;
        const extra = Object.fromEntries(
          Object.entries(b as Record<string, unknown>).filter(
            ([k]) => !['message', 'error', 'statusCode'].includes(k),
          ),
        );
        if (Object.keys(extra).length) details = extra;
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    void res.status(status).send({
      success: false,
      error: { code, message, statusCode: status, ...(details ? { details } : {}) },
      meta: { timestamp: new Date().toISOString(), path: req.url },
    });
  }
}
