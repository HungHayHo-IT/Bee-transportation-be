import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { Observable, map } from 'rxjs';
import { SKIP_ENVELOPE } from '../decorators/skip-envelope.decorator';
import { BaseResponseDto } from '../dto/base-response.dto';

/** Controller trả thẳng DTO; vỏ { success, data, meta } dựng ở đây. */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, BaseResponseDto<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler<T>): Observable<BaseResponseDto<T> | T> {
    // Luồng SSE phát nhiều khung liên tiếp — bọc vỏ vào từng khung là hỏng giao thức.
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return next.handle();

    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        meta: { timestamp: new Date().toISOString(), path: req.url },
      })),
    );
  }
}
