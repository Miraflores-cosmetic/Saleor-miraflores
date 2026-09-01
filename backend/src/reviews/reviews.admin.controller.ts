import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { parseOptionalPositiveInt } from '../common/parse-positive-int';
import { CreateReviewAdminDto, UpdateReviewAdminDto } from './dto/reviews.dto';
import { ReviewsAdminService } from './reviews.admin.service';

@Controller('reviews/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsAdminService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 6 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Файл не передан');
    return this.reviews.uploadImage(file);
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('status') status?: 'all' | 'pending' | 'published',
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const st =
      status === 'pending' || status === 'published' || status === 'all' ? status : 'all';
    return this.reviews.list({
      q,
      status: st,
      productId,
      page: parseOptionalPositiveInt(page),
      limit: parseOptionalPositiveInt(limit),
    });
  }

  @Post()
  create(@Body() dto: CreateReviewAdminDto, @CurrentUser('sub') userId: string) {
    return this.reviews.create(dto, userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.reviews.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewAdminDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.reviews.update(id, dto, userId);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.reviews.publish(id, userId);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.reviews.unpublish(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reviews.remove(id);
  }
}
