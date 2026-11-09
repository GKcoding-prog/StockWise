import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CategoryListQuerySchema,
  CreateCategorySchema,
  UpdateCategorySchema,
} from '@stockwise/shared';
import { RequirePermissions } from '../../common/auth/decorators';
import { ZodPipe, type Out } from '../../common/pipes/zod.pipe';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions('products.view')
  list(@Query(new ZodPipe(CategoryListQuerySchema)) q: Out<typeof CategoryListQuerySchema>) {
    return this.categories.list(q);
  }

  @Post()
  @RequirePermissions('categories.manage')
  create(@Body(new ZodPipe(CreateCategorySchema)) body: Out<typeof CreateCategorySchema>) {
    return this.categories.create(body);
  }

  @Patch(':id')
  @RequirePermissions('categories.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateCategorySchema)) body: Out<typeof UpdateCategorySchema>,
  ) {
    return this.categories.update(id, body);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions('categories.manage')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.setArchived(id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePermissions('categories.manage')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.setArchived(id, false);
  }
}
