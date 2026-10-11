import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SupabaseJwtGuard } from '../../auth/guards';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { RecycleBinService, RecycleBinType } from '../services/recycle-bin.service';

/**
 * The single API surface of the universal Recycle Bin.
 *
 * Viewing the trash is an organisation-scoped read available to any
 * authenticated operator — hiding a deleted record from the people who might
 * need to recover it defeats the purpose. RESTORING is a permission-gated
 * write, and PERMANENT DELETION is admin-only via the role bypass built into
 * `PermissionGuard`, so a stray non-admin session can never reach a hard delete.
 */
@ApiTags('admin/recycle-bin')
@Controller('admin/recycle-bin')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class RecycleBinController {
  constructor(private readonly service: RecycleBinService) {}

  private companyId(req: any): string {
    return (
      req?.erpUser?.defaultCompanyId ||
      req?.user?.defaultCompanyId ||
      '00000000-0000-0000-0000-000000000001'
    );
  }

  private userId(req: any): string | undefined {
    return req?.erpUser?.id || req?.user?.id;
  }

  @Get()
  @RequireOrgScope()
  @ApiOperation({ summary: 'Trash count per module, for the Recycle Bin tab badges' })
  async counts(@Req() req: any) {
    const data = await this.service.counts(this.companyId(req));
    return { success: true, data };
  }

  @Get(':type')
  @RequireOrgScope()
  @ApiParam({ name: 'type', enum: RecycleBinType })
  @ApiQuery({ name: 'limit', required: false, description: 'Rows to return (1-500, default 200)' })
  @ApiOperation({ summary: 'List soft-deleted records for one module' })
  async list(
    @Req() req: any,
    @Param('type') type: RecycleBinType,
    @Query('limit') limit?: number,
  ) {
    const data = await this.service.list(type, this.companyId(req), limit ?? 200);
    return { success: true, data, total: data.length };
  }

  @Post(':type/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.recycle_bin.restore')
  @ApiParam({ name: 'type', enum: RecycleBinType })
  @ApiParam({ name: 'id', description: 'Record id' })
  @ApiOperation({ summary: 'Clear deleted_at and return the record to its live grid' })
  async restore(
    @Req() req: any,
    @Param('type') type: RecycleBinType,
    @Param('id') id: string,
  ) {
    const data = await this.service.restore(type, id, this.companyId(req), this.userId(req));
    return { success: true, data, message: `${data.summary} restored to its live grid` };
  }

  @Delete(':type/:id')
  @HttpCode(HttpStatus.OK)
  @RequireOrgScope()
  @UseGuards(PermissionGuard)
  @RequirePermission('admin.recycle_bin.purge')
  @ApiParam({ name: 'type', enum: RecycleBinType })
  @ApiParam({ name: 'id', description: 'Record id — must already be in the Recycle Bin' })
  @ApiOperation({ summary: 'ADMIN ONLY — permanently purge a record that is already in the Recycle Bin' })
  async purge(
    @Req() req: any,
    @Param('type') type: RecycleBinType,
    @Param('id') id: string,
    @Body() _body?: unknown,
  ) {
    await this.service.purge(type, id, this.companyId(req));
    return { success: true, message: 'Record permanently deleted' };
  }
}
