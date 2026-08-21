import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { BomService } from '../services/bom.service';
import { CreateBomDto, UpdateBomDto, UpdateBomStatusDto } from '../dto';

@ApiTags('BOM')
@Controller('bom')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class BomController {
  constructor(private readonly bomService: BomService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.view')
  @ApiOperation({ summary: 'List all BOMs' })
  async findAll(@Req() req: any) {
    const companyId = this.getCompanyId(req);
    const boms = await this.bomService.findAll(companyId);
    return { data: boms, total: boms.length };
  }

  @Get('product/:productId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.view')
  @ApiOperation({ summary: 'Get active BOM for a product' })
  async findByProduct(@Param('productId', ParseUUIDPipe) productId: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const bom = await this.bomService.findByProduct(productId, companyId);
    return { data: bom };
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.view')
  @ApiOperation({ summary: 'Get BOM by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const bom = await this.bomService.findOne(id, companyId);
    return { data: bom };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.create')
  @ApiOperation({ summary: 'Create a new BOM' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBomDto, @Req() req: any) {
    dto.companyId = this.getCompanyId(req);
    const bom = await this.bomService.create(dto, req.user?.id);
    return { data: bom, message: 'BOM created successfully' };
  }

  @Put(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.update')
  @ApiOperation({ summary: 'Update a BOM' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBomDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const bom = await this.bomService.update(id, dto, companyId, req.user?.id);
    return { data: bom, message: 'BOM updated successfully' };
  }

  @Put(':id/status')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.change_status')
  @ApiOperation({ summary: 'Change BOM status' })
  async changeStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBomStatusDto, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const bom = await this.bomService.changeStatus(id, dto, companyId, req.user?.id);
    return { data: bom, message: `BOM status changed to ${dto.status}` };
  }

  @Put(':id/recalculate')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.update')
  @ApiOperation({ summary: 'Recalculate BOM estimated cost' })
  async recalculateCost(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    const bom = await this.bomService.recalculateCost(id, companyId);
    return { data: bom, message: 'Cost recalculated' };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.bom.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a BOM' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const companyId = this.getCompanyId(req);
    await this.bomService.remove(id, companyId, req.user?.id);
    return { message: 'BOM deleted successfully' };
  }
}
