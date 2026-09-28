import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard, RequireOrgScope } from '../../auth/guards/org-scope.guard';
import { DivisionScopeGuard, divisionFilterFromRequest } from '../../auth/guards/division-scope.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { VisitorEntryService, MAX_PHOTO_BYTES } from '../services';
import { CreateVisitorEntryDto, ListVisitorEntriesQueryDto, HostLookupQueryDto } from '../dto';

/**
 * Visitor Entry API (Prompt #17).
 *
 * Standard guard chain: JWT → PermissionGuard → OrgScopeGuard → DivisionScopeGuard.
 * `DivisionScopeGuard` rejects an explicit `divisionId` outside the caller's
 * effective division set before the handler runs; the service then re-checks
 * every row, so a guessed entry id still cannot be read (§11/§14).
 *
 * Time-In is never accepted from the client — `CreateVisitorEntryDto` does not
 * declare `timeIn`, and the global ValidationPipe runs with
 * `forbidNonWhitelisted: true`, so sending it is a 400.
 */
@ApiTags('visitor')
@Controller('visitor')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, PermissionGuard, OrgScopeGuard, DivisionScopeGuard)
export class VisitorEntryController {
  constructor(private readonly visitorService: VisitorEntryService) {}

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

  private divisions(req: any): string[] | undefined {
    return divisionFilterFromRequest(req.allowedDivisionIds);
  }

  // ─────────────────────────────────────────────────────── HOST LOOKUP ────
  @Get('hosts')
  @RequirePermission('visitor.entry.create')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Search the employee master for the person being visited' })
  async findHosts(@Query() query: HostLookupQueryDto, @Req() req: any) {
    const data = await this.visitorService.findHosts(this.getCompanyId(req), this.divisions(req), {
      search: query.search,
      divisionId: query.divisionId,
      limit: query.limit,
    });
    return { success: true, data };
  }

  // ──────────────────────────────────────────────────────────── LIST ──────
  @Get('entries')
  @RequirePermission('visitor.entry.view')
  @RequireOrgScope()
  @ApiOperation({ summary: 'List visitor entries (server-side division filtered)' })
  async findAll(@Query() query: ListVisitorEntriesQueryDto, @Req() req: any) {
    const result = await this.visitorService.findAll({
      companyId: this.getCompanyId(req),
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      divisionId: query.divisionId,
      locationId: query.locationId,
      allowedDivisionIds: this.divisions(req),
    });
    return { success: true, ...result };
  }

  // ─────────────────────────────────────────────────────────── CREATE ─────
  @Post('entries')
  @RequirePermission('visitor.entry.create')
  @RequireOrgScope()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a visitor (server-side Time-In, status PENDING)' })
  @ApiResponse({ status: 201, description: 'Visitor entry created' })
  @ApiResponse({ status: 400, description: 'Invalid division/location/host combination or invalid CNIC' })
  @ApiResponse({ status: 403, description: 'Division outside the caller access scope' })
  async create(@Body() dto: CreateVisitorEntryDto, @Req() req: any) {
    const entry = await this.visitorService.create(
      dto,
      this.getCompanyId(req),
      this.getUserId(req),
      this.divisions(req),
    );
    return { success: true, data: entry, message: 'Visitor registered successfully' };
  }

  // ─────────────────────────────────────────────────────────── DETAIL ─────
  @Get('entries/:id')
  @RequirePermission('visitor.entry.view')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Get one visitor entry (authorised divisions only)' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    const entry = await this.visitorService.findOne(id, this.getCompanyId(req), this.divisions(req));
    return { success: true, data: entry };
  }

  // ──────────────────────────────────────────────────────────── PHOTO ─────
  @Post('entries/:id/photo')
  @RequirePermission('visitor.entry.create')
  @RequireOrgScope()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  @ApiOperation({ summary: 'Upload the visitor photo taken with the camera (or uploaded)' })
  @ApiParam({ name: 'id' })
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: any, @Req() req: any) {
    const entry = await this.visitorService.savePhoto(
      id,
      this.getCompanyId(req),
      this.getUserId(req),
      file,
      this.divisions(req),
    );
    return { success: true, data: entry, message: 'Visitor photo saved' };
  }

  @Get('entries/:id/photo')
  @RequirePermission('visitor.entry.view')
  @RequireOrgScope()
  @ApiOperation({ summary: 'Stream the visitor photo (permission + division checked)' })
  @ApiParam({ name: 'id' })
  async getPhoto(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const photo = await this.visitorService.resolvePhoto(
      id,
      this.getCompanyId(req),
      this.divisions(req),
    );
    if (!photo) {
      throw new NotFoundException('No photo is attached to this visitor entry');
    }

    res.set({
      'Content-Type': photo.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    });
    createReadStream(photo.absolutePath).pipe(res);
  }
}
