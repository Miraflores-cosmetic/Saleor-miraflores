import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import {
  parseOptionalNonNegInt,
  parseOptionalPositiveInt,
} from '../common/parse-positive-int';
import { CatalogPublicService } from './catalog.public.service';
import { SyncCartDto } from './dto/cart-sync.dto';

@Public()
@Controller('catalog')
export class CatalogPublicController {
  constructor(private readonly catalogPublic: CatalogPublicService) {}

  @Get('products')
  listProducts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('collection') collection?: string,
    @Query('sort') sort?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('sale') sale?: string,
  ) {
    return this.catalogPublic.listProducts({
      page: parseOptionalPositiveInt(page),
      limit: parseOptionalPositiveInt(limit),
      categorySlug: category?.trim() || undefined,
      tagSlug: tag?.trim() || undefined,
      collectionSlug: collection?.trim() || undefined,
      sort: sort?.trim() || undefined,
      priceMin: parseOptionalNonNegInt(priceMin),
      priceMax: parseOptionalNonNegInt(priceMax),
      saleOnly: sale === '1' || sale === 'true',
    });
  }

  /** Guest cart: refresh price/stock, drop dead variants. */
  @Post('cart/sync')
  syncCart(@Body() dto: SyncCartDto) {
    return this.catalogPublic.syncCartLines(dto.lines ?? []);
  }

  @Get('products/:slug/set-siblings')
  setSiblings(@Param('slug') slug: string) {
    return this.catalogPublic.getSetSiblings(slug);
  }

  @Get('products/:slug')
  async product(@Param('slug') slug: string) {
    const product = await this.catalogPublic.getProductBySlug(slug);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  @Get('collections')
  listCollections() {
    return this.catalogPublic.listCollections();
  }

  @Get('categories')
  listCategories() {
    return this.catalogPublic.listCategories();
  }

  @Get('tags')
  listCatalogTags() {
    return this.catalogPublic.listCatalogTags();
  }
}
