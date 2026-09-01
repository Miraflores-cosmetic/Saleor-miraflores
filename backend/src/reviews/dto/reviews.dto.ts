import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReviewAdminDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating!: number;

  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  authorName?: string | null;

  @IsOptional()
  @IsString()
  image1Url?: string | null;

  @IsOptional()
  @IsString()
  image2Url?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateReviewAdminDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;

  @IsOptional()
  @IsString()
  authorName?: string | null;

  @IsOptional()
  @IsString()
  image1Url?: string | null;

  @IsOptional()
  @IsString()
  image2Url?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class CreateReviewPublicDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating!: number;

  @IsString()
  @MinLength(10, { message: 'Текст отзыва — минимум 10 символов' })
  text!: string;

  @IsOptional()
  @IsString()
  orderId?: string | null;

  @IsOptional()
  @IsString()
  authorName?: string | null;
}
