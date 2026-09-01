import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ADMIN_LIST_DEFAULT_LIMIT, ADMIN_LIST_MAX_LIMIT } from '../catalog/catalog.constants';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import type { CreateReviewAdminDto, UpdateReviewAdminDto } from './dto/reviews.dto';

function serializeReview(
  r: Prisma.ProductReviewGetPayload<{
    include: {
      product: { select: { id: true; name: true; slug: true } };
      user: { select: { id: true; email: true; displayName: true } };
    };
  }>,
) {
  return {
    id: r.id,
    productId: r.productId,
    product: r.product,
    userId: r.userId,
    user: r.user
      ? {
          id: r.user.id,
          email: r.user.email,
          displayName: r.user.displayName,
        }
      : null,
    orderId: r.orderId,
    rating: r.rating,
    text: r.text,
    authorName: r.authorName,
    image1Url: r.image1Url,
    image2Url: r.image2Url,
    isPublished: r.isPublished,
    moderatedById: r.moderatedById,
    moderatedAt: r.moderatedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const reviewInclude = {
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { id: true, email: true, displayName: true } },
} satisfies Prisma.ProductReviewInclude;

function buildListWhere(opts: {
  q?: string;
  status?: 'all' | 'pending' | 'published';
  productId?: string;
}): Prisma.ProductReviewWhereInput {
  const where: Prisma.ProductReviewWhereInput = {};
  if (opts.status === 'pending') where.isPublished = false;
  if (opts.status === 'published') where.isPublished = true;
  if (opts.productId) where.productId = opts.productId;
  const q = opts.q?.trim();
  if (q) {
    where.OR = [
      { text: { contains: q, mode: 'insensitive' } },
      { authorName: { contains: q, mode: 'insensitive' } },
      { product: { name: { contains: q, mode: 'insensitive' } } },
      { product: { slug: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { displayName: { contains: q, mode: 'insensitive' } } },
    ];
  }
  return where;
}

@Injectable()
export class ReviewsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LocalStorageService,
  ) {}

  async list(opts: {
    q?: string;
    status?: 'all' | 'pending' | 'published';
    productId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(
      ADMIN_LIST_MAX_LIMIT,
      Math.max(1, opts.limit ?? ADMIN_LIST_DEFAULT_LIMIT),
    );
    const where = buildListWhere(opts);
    const baseForCounts = buildListWhere({
      q: opts.q,
      productId: opts.productId,
      status: 'all',
    });

    const [total, rows, all, pending, published] = await Promise.all([
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productReview.count({ where: baseForCounts }),
      this.prisma.productReview.count({
        where: { ...baseForCounts, isPublished: false },
      }),
      this.prisma.productReview.count({
        where: { ...baseForCounts, isPublished: true },
      }),
    ]);

    return {
      items: rows.map(serializeReview),
      total,
      page,
      limit,
      counts: { all, pending, published },
    };
  }

  async get(id: string) {
    const row = await this.prisma.productReview.findUnique({
      where: { id },
      include: reviewInclude,
    });
    if (!row) throw new NotFoundException('Отзыв не найден');
    return serializeReview(row);
  }

  async create(dto: CreateReviewAdminDto, moderatorId?: string) {
    await this.requireProduct(dto.productId);
    const rating = dto.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Рейтинг 1–5');
    }
    const published = dto.isPublished ?? false;
    const row = await this.prisma.productReview.create({
      data: {
        productId: dto.productId,
        rating,
        text: dto.text.trim(),
        authorName: dto.authorName?.trim() || null,
        image1Url: dto.image1Url?.trim() || null,
        image2Url: dto.image2Url?.trim() || null,
        isPublished: published,
        moderatedById: published ? moderatorId ?? null : null,
        moderatedAt: published ? new Date() : null,
      },
      include: reviewInclude,
    });
    return serializeReview(row);
  }

  async update(id: string, dto: UpdateReviewAdminDto, moderatorId?: string) {
    const existing = await this.prisma.productReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Отзыв не найден');

    const data: Prisma.ProductReviewUpdateInput = {};
    if (dto.rating !== undefined) {
      if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
        throw new BadRequestException('Рейтинг 1–5');
      }
      data.rating = dto.rating;
    }
    if (dto.text !== undefined) data.text = dto.text.trim();
    if (dto.authorName !== undefined) data.authorName = dto.authorName?.trim() || null;

    const nextImage1 =
      dto.image1Url !== undefined ? dto.image1Url?.trim() || null : existing.image1Url;
    const nextImage2 =
      dto.image2Url !== undefined ? dto.image2Url?.trim() || null : existing.image2Url;
    if (dto.image1Url !== undefined) data.image1Url = nextImage1;
    if (dto.image2Url !== undefined) data.image2Url = nextImage2;

    if (dto.isPublished !== undefined) {
      data.isPublished = dto.isPublished;
      if (dto.isPublished && !existing.isPublished) {
        data.moderatedBy = moderatorId
          ? { connect: { id: moderatorId } }
          : undefined;
        data.moderatedAt = new Date();
      }
    }

    const row = await this.prisma.productReview.update({
      where: { id },
      data,
      include: reviewInclude,
    });

    if (dto.image1Url !== undefined || dto.image2Url !== undefined) {
      const keep = new Set(
        [nextImage1, nextImage2].filter((u): u is string => Boolean(u)),
      );
      for (const old of [existing.image1Url, existing.image2Url]) {
        if (old && !keep.has(old)) {
          await this.storage.deleteByPublicUrl(old);
        }
      }
    }

    return serializeReview(row);
  }

  async publish(id: string, moderatorId: string) {
    return this.update(id, { isPublished: true }, moderatorId);
  }

  async unpublish(id: string) {
    return this.update(id, { isPublished: false });
  }

  async remove(id: string) {
    const existing = await this.prisma.productReview.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Отзыв не найден');
    await this.prisma.productReview.delete({ where: { id } });
    if (existing.image1Url) await this.storage.deleteByPublicUrl(existing.image1Url);
    if (existing.image2Url) await this.storage.deleteByPublicUrl(existing.image2Url);
    return { ok: true };
  }

  async uploadImage(file: {
    buffer: Buffer;
    mimetype: string;
    size: number;
    originalname?: string;
  }) {
    const { url } = await this.storage.saveImage(file, 'reviews');
    return { url };
  }

  private async requireProduct(productId: string) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Товар не найден');
  }
}
