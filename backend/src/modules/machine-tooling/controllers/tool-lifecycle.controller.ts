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
import { ToolLifecycleService } from '../services';
import {
  InstallToolDto,
  RemoveToolDto,
  UpdateDispositionDto,
  LinkStoreIssueDto,
  CreateComponentItemDto,
  UpdateComponentItemDto,
  ComponentItemQueryDto,
  ActiveToolsQueryDto,
  LifeReportQueryDto,
} from '../dto';

/**
 * TASK26 — Tool Lifecycle REST API.
 *
 * Install / Remove / Dispose operate on `component_changes`. Active tools are
 * the changes with `closed_at IS NULL`; the automatic production life is
 * derived from real production entries (machine counters are not native).
 */
@ApiTags('Tool Lifecycle')
@Controller('machine-tooling')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class ToolLifecycleController {
  constructor(private readonly service: ToolLifecycleService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException('No company scope found. Set a default company or assign an org scope.');
    }
    return companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  @Get('disposition-types')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'List tool disposition types (RETURN_TO_STORE / SENT_FOR_REWORK / SCRAPPED / LOST / RETAINED / OTHER)' })
  dispositionTypes() {
    return this.service.getDispositionTypes();
  }

  @Get('active-tools')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'Currently installed (active) tools with derived used/remaining production life' })
  async activeTools(@Query() query: ActiveToolsQueryDto, @Req() req: any) {
    return this.service.activeTools(this.getCompanyId(req), query);
  }

  @Get('life-report')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'Tool Life History report — install/removal counters, production life, disposition, store issue' })
  async lifeReport(@Query() query: LifeReportQueryDto, @Req() req: any) {
    return this.service.lifeReport(this.getCompanyId(req), query);
  }

  @Get('life/:id')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.view')
  @ApiOperation({ summary: 'Single tool lifecycle detail (with derived counters)' })
  async lifeDetail(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: any) {
    return this.service.lifeDetail(this.getCompanyId(req), id);
  }

  @Post('install')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Install a tool — creates the open lifecycle change (single-active per component)' })
  async install(@Body() dto: InstallToolDto, @Req() req: any) {
    return this.service.install(dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Post('changes/:id/remove')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.create')
  @ApiOperation({ summary: 'Remove the installed tool — closes the change, computes production life (counterBefore − counterAfter)' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: RemoveToolDto, @Req() req: any) {
    return this.service.remove(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Post('changes/:id/dispose')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.update')
  @ApiOperation({ summary: 'Record the disposition of a removed tool (return / rework / scrap / lost / retained / other)' })
  async dispose(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateDispositionDto, @Req() req: any) {
    return this.service.updateDisposition(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Post('changes/:id/link-issue')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.component_change.update')
  @ApiOperation({ summary: 'Link an existing POSTED store issue (material_issues) as the source of the installed tool — reuses stock, no duplicate balances' })
  async linkIssue(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: LinkStoreIssueDto, @Req() req: any) {
    return this.service.linkStoreIssue(id, dto.storeIssueId, this.getCompanyId(req), this.getUserId(req));
  }

  // ─── Multi-item breakdown of a tool / component (Item Master lines) ────────

  @Get('components/:id/items')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.view')
  @ApiOperation({ summary: 'Item-Master breakdown lines of a tool / component (each line keeps its own UOM)' })
  async listComponentItems(@Param('id', new ParseUUIDPipe()) id: string, @Query() _query: ComponentItemQueryDto, @Req() req: any) {
    return this.service.listComponentItems(id, this.getCompanyId(req));
  }

  @Post('components/:id/items')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an Item-Master breakdown line to a tool / component' })
  async addComponentItem(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateComponentItemDto, @Req() req: any) {
    return this.service.addComponentItem(id, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Put('components/:id/items/:itemId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.update')
  @ApiOperation({ summary: 'Update an Item-Master breakdown line' })
  async updateComponentItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateComponentItemDto,
    @Req() req: any,
  ) {
    return this.service.updateComponentItem(id, itemId, dto, this.getCompanyId(req), this.getUserId(req));
  }

  @Delete('components/:id/items/:itemId')
  @UseGuards(PermissionGuard)
  @RequireOrgScope()
  @RequirePermission('manufacturing.tool_component.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an Item-Master breakdown line' })
  async deleteComponentItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: any,
  ) {
    await this.service.removeComponentItem(id, itemId, this.getCompanyId(req), this.getUserId(req));
  }
}