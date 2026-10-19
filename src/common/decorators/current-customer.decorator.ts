import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthenticatedCustomer } from '../types/authenticated-customer.type';

/** Chỉ hợp lệ trên route đã áp @UseGuards(CustomerJwtGuard). */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & {
      user?: AuthenticatedCustomer;
    }>();
    if (!req.user) throw new Error('CurrentCustomer chỉ dùng sau CustomerJwtGuard');
    return req.user;
  },
);
