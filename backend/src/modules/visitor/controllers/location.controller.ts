import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { LocationService } from '../services';
import { CreateLocationDto, UpdateLocationDto } from '../dto';
import { LocationStatus } from '../entities';

/**
 * Location master API (Company → Division → Location).
 *
 * Guards run in the project's standard order (JWT → permission → org scope →
 * division scope), so an explicit `divisionId` outside the caller's effective
 * division set is rejected with 403 BEFORE this controller runs, and the
 * service re-checks every row it touches.
 */
@ApiTags('organization/locations')
@Controller('locations')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, PermissionGuard, OrgScopeGuard, DivisionScopeGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  private getCompanyId(req: any): string {
    const companyId = req.erpUser?.defaultCompanyId || req.orgScopes?.[0]?.companyId;
    if (!companyId) {
      throw new BadRequestException(
        'No company scope found. Set a default company or assign an org scope.',
      );
    }
    return companyId;
  }

  private getUserId(req: any): string | undefined {
    return req.erpUser?.id;
  }

  /** Divisions the service may filter with; `undefined` = unrestricted (legacy). */
  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  @Post()
  @RequirePermission('location.create')
  @RequireOrgScope()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a location under a division' })
  @ApiResponse({ status: 201, description: 'Location created' })
  @ApiResponse({ status: 409, description: 'Location code already exists' })
  async create(@Body() dto: CreateLocationDto, @Req() req: any) {
    const location = await this.locationService.create(dto, this.getCompanyId(req), this.getUserId(req));
    return { success: true, data: location, message: 'Location created successfully' };
  }

  @Get()
  @RequirePermission('location.view')
  @RequireOrgScope()
  @ApiOperation({ summary: 'List locations (filtered to authorised divisions)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: LocationStatus })
  @ApiQuery({ name: 'divisionId', required: false })
  async findAll(
    @Query()
    query: {
      page?: string;
      limit?: string;
      search?: string;
      status?: LocationStatus;
      divisionId?: string;
    },
    @Req() req: any,
  ) {
    const result = await this.locationService.findAll({
      companyId: this.getCompanyId(req),
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search,
      status: query.status,
      divisionId: query.divisionId,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, ...result };
  }

  @Get(':id')
  @RequirePermission('location.view')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Get one location' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const location = await this.locationService.findOne(id, this.getCompanyId(req), this.divisions(req));
    return { success: true, data: location };
  }

  @Patch(':id')
  @RequirePermission('location.update')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Update a location' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() dto: UpdateLocationDto, @Req() req: any) {
    const location = await this.locationService.update(
      id,
      dto,
      this.getCompanyId(req),
      this.getUserId(req),
      this.divisions(req),
    );
    return { success: true, data: location, message: 'Location updated successfully' };
  }

  @Delete(':id')
  @RequirePermission('location.delete')
  @RequireOrgScope()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a location that has no visitor entries' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.locationService.remove(id, this.getCompanyId(req), this.divisions(req));
    return { success: true, message: 'Location deleted successfully' };
  }
}
