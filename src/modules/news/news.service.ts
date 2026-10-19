import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityService } from '@/common/activity/activity.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AuthenticatedUser } from '@/common/types/authenticated-user.type';
import {
  CreateNewsArticleDto, NewsArticleDto, NewsPageDto, PublicNewsDetailDto,
  PublicNewsPageDto, PublicNewsSummaryDto, UpdateNewsArticleDto,
} from './dto/news.dto';

const INCLUDE = { creator: { select: { id: true, fullName: true } } };
type NewsRow = Prisma.NewsArticleGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private toAdminDto(r: NewsRow): NewsArticleDto {
    return {
      id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt, body: r.body,
      coverImageUrl: r.coverImageUrl, status: r.status,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdById: r.createdBy, createdByName: r.creator?.fullName ?? null,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    };
  }

  private toPublicSummary(r: NewsRow): PublicNewsSummaryDto {
    return {
      id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt,
      coverImageUrl: r.coverImageUrl,
      // publishedAt chắc chắn không null vì chỉ show 'published'.
      publishedAt: (r.publishedAt ?? r.updatedAt).toISOString(),
    };
  }

  async createArticle(
    dto: CreateNewsArticleDto,
    user: AuthenticatedUser,
  ): Promise<NewsArticleDto> {
    try {
      const status = dto.status ?? 'draft';
      const row = await this.prisma.newsArticle.create({
        data: {
          slug: dto.slug, title: dto.title,
          excerpt: dto.excerpt ?? null, body: dto.body ?? '',
          coverImageUrl: dto.coverImageUrl ?? null, status,
          publishedAt: status === 'published' ? new Date() : null,
          createdBy: user.id,
        },
        include: INCLUDE,
      });
      await this.activity.log(null, {
        entity: 'news_articles', entityId: row.id, action: 'create', actorId: user.id,
      });
      return this.toAdminDto(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ConflictException('Slug đã tồn tại');
      throw err;
    }
  }

  async list(
    status: string | undefined, page: number, limit: number,
  ): Promise<NewsPageDto> {
    const where: Prisma.NewsArticleWhereInput = {};
    if (status) where.status = status;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.findMany({
        where, include: INCLUDE, orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
    ]);
    return { items: items.map((r) => this.toAdminDto(r)), total, page, limit };
  }

  async detail(id: number): Promise<NewsArticleDto> {
    const row = await this.prisma.newsArticle.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy bài viết');
    return this.toAdminDto(row);
  }

  async update(
    id: number, dto: UpdateNewsArticleDto, user: AuthenticatedUser,
  ): Promise<NewsArticleDto> {
    const cur = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Không tìm thấy bài viết');

    const data: Prisma.NewsArticleUpdateInput = { updatedAt: new Date() };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.status !== undefined) {
      data.status = dto.status;
      // Lần đầu chuyển sang published: đóng dấu thời gian. Đã có publishedAt thì
      // giữ nguyên (chỉnh sửa lại không thay đổi thứ tự trên landing).
      if (dto.status === 'published' && cur.publishedAt === null) data.publishedAt = new Date();
    }
    try {
      const row = await this.prisma.newsArticle.update({
        where: { id }, data, include: INCLUDE,
      });
      await this.activity.log(null, {
        entity: 'news_articles', entityId: id, action: 'update', actorId: user.id,
      });
      return this.toAdminDto(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ConflictException('Slug đã tồn tại');
      throw err;
    }
  }

  async remove(id: number, user: AuthenticatedUser): Promise<void> {
    const cur = await this.prisma.newsArticle.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Không tìm thấy bài viết');
    await this.prisma.newsArticle.delete({ where: { id } });
    await this.activity.log(null, {
      entity: 'news_articles', entityId: id, action: 'delete', actorId: user.id,
    });
  }

  async publicList(page: number, limit: number): Promise<PublicNewsPageDto> {
    const where: Prisma.NewsArticleWhereInput = { status: 'published' };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.findMany({
        where, include: INCLUDE, orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
    ]);
    return { items: items.map((r) => this.toPublicSummary(r)), total, page, limit };
  }

  async publicDetail(slug: string): Promise<PublicNewsDetailDto> {
    const row = await this.prisma.newsArticle.findFirst({
      where: { slug, status: 'published' }, include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Không tìm thấy bài viết');
    return { ...this.toPublicSummary(row), body: row.body };
  }
}
