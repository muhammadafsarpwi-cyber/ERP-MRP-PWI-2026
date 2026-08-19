import { Controller, Get, Post, Patch, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { ItemDocumentService } from '../services/item-document.service';
import { CreateItemDocumentDto, UpdateItemDocumentDto } from '../dto/item-document.dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('master-data/documents')
@Controller('master-data')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class ItemDocumentController {
  constructor(private readonly documentService: ItemDocumentService) {}

  @Post('items/:itemId/documents')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_document.create')
  @ApiOperation({ summary: 'Create document for item' })
  @ApiParam({ name: 'itemId' })
  async create(@Param('itemId') itemId: string, @Body() dto: CreateItemDocumentDto) {
    dto.itemId = itemId;
    const doc = await this.documentService.create(dto);
    return { success: true, data: doc, message: 'Document created' };
  }

  @Get('items/:itemId/documents')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_document.view')
  @ApiOperation({ summary: 'List documents for item' })
  @ApiParam({ name: 'itemId' })
  async findAllByItem(@Param('itemId') itemId: string) {
    const docs = await this.documentService.findAllByItem(itemId);
    return { success: true, data: docs };
  }

  @Patch('documents/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_document.update')
  @ApiOperation({ summary: 'Update document' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateItemDocumentDto) {
    const doc = await this.documentService.update(id, dto);
    return { success: true, data: doc, message: 'Document updated' };
  }

  @Patch('documents/:id/deactivate')
  @UseGuards(PermissionGuard)
  @RequirePermission('item_document.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate document' })
  @ApiParam({ name: 'id' })
  async deactivate(@Param('id') id: string) {
    const doc = await this.documentService.deactivate(id);
    return { success: true, data: doc, message: 'Document deactivated' };
  }
}
