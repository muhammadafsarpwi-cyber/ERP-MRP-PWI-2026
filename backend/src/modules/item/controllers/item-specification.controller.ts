import { Controller, Get, Post, Patch, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ItemSpecificationService } from '../services/item-specification.service';
import { CreateItemSpecificationDto, UpdateItemSpecificationDto } from '../dto/item-specification.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/specifications')
@Controller('master-data')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemSpecificationController {
  constructor(private readonly specService: ItemSpecificationService) {}

  @Post('items/:itemId/specifications')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_specification.create')
  @ApiOperation({ summary: 'Create specification for item' })
  @ApiParam({ name: 'itemId' })
  async create(@Param('itemId') itemId: string, @Body() dto: CreateItemSpecificationDto) {
    dto.itemId = itemId;
    const spec = await this.specService.create(dto);
    return { success: true, data: spec, message: 'Specification created' };
  }

  @Get('items/:itemId/specifications')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_specification.view')
  @ApiOperation({ summary: 'List specifications for item' })
  @ApiParam({ name: 'itemId' })
  async findAllByItem(@Param('itemId') itemId: string) {
    const specs = await this.specService.findAllByItem(itemId);
    return { success: true, data: specs };
  }

  @Patch('specifications/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_specification.update')
  @ApiOperation({ summary: 'Update specification' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateItemSpecificationDto) {
    const spec = await this.specService.update(id, dto);
    return { success: true, data: spec, message: 'Specification updated' };
  }

  @Patch('specifications/:id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_specification.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate specification' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const spec = await this.specService.deactivate(id);
    return { success: true, data: spec, message: 'Specification deactivated' };
  }
}
