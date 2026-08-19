import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ItemAttributeService } from '../services/item-attribute.service';
import { CreateAttributeDefinitionDto, CreateAttributeValueDto, UpdateAttributeValueDto } from '../dto/item-attribute.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/attributes')
@Controller('master-data')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemAttributeController {
  constructor(private readonly attributeService: ItemAttributeService) {}

  @Post('attributes')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_attribute.create')
  @ApiOperation({ summary: 'Create attribute definition' })
  async createDefinition(@Body() dto: CreateAttributeDefinitionDto) {
    const def = await this.attributeService.createDefinition(dto);
    return { success: true, data: def, message: 'Attribute definition created' };
  }

  @Get('attributes')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_attribute.view')
  @ApiOperation({ summary: 'List attribute definitions' })
  async findAllDefinitions() {
    const defs = await this.attributeService.findAllDefinitions();
    return { success: true, data: defs };
  }

  @Post('attributes/values')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_attribute.create')
  @ApiOperation({ summary: 'Add attribute value to item' })
  async addAttributeValue(@Body() dto: CreateAttributeValueDto) {
    const value = await this.attributeService.addAttributeValue(dto);
    return { success: true, data: value, message: 'Attribute value added' };
  }

  @Get('items/:itemId/attributes')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_attribute.view')
  @ApiOperation({ summary: 'Get attribute values for item' })
  @ApiParam({ name: 'itemId' })
  async findAttributeValues(@Param('itemId') itemId: string) {
    const values = await this.attributeService.findAttributeValues(itemId);
    return { success: true, data: values };
  }

  @Patch('attributes/values/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_attribute.update')
  @ApiOperation({ summary: 'Update attribute value' })
  @ApiParam({ name: 'id' })
  async updateAttributeValue(@Param('id') id: string, @Body() dto: UpdateAttributeValueDto) {
    const value = await this.attributeService.updateAttributeValue(id, dto);
    return { success: true, data: value, message: 'Attribute value updated' };
  }

  @Delete('attributes/values/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_attribute.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove attribute value' })
  @ApiParam({ name: 'id' })
  async removeAttributeValue(@Param('id') id: string) {
    await this.attributeService.removeAttributeValue(id);
    return { success: true, message: 'Attribute value removed' };
  }
}
