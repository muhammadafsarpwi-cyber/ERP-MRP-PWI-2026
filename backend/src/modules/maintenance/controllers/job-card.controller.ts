import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards';
import { PermissionGuard, RequirePermission } from '../../auth/guards';
import { CurrentUser, CurrentUserId } from '../../../common/decorators/user.decorator';
import { MaintenanceJobCardService } from '../services';
import {
  CreateJobCardDto, UpdateJobCardDto, AssignJobCardDto,
  AddJobCardPartDto, AddWorkLogDto, RejectJobCardDto, JobCardQueryDto,
} from '../dto';

@ApiTags('Maintenance - Job Cards')
@ApiBearerAuth()
@UseGuards(SupabaseJwtGuard, PermissionGuard)
@Controller('master-data/maintenance/job-cards')
export class MaintenanceJobCardController {
  constructor(private readonly jobCardService: MaintenanceJobCardService) {}

  @Post()
  @RequirePermission('maintenance.job_card.create')
  @ApiOperation({ summary: 'Create a new job card' })
  create(@Body() dto: CreateJobCardDto, @CurrentUser() user: any) {
    return this.jobCardService.create(dto, user.id);
  }

  @Get()
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'List job cards with filters' })
  findAll(@Query() query: JobCardQueryDto) {
    return this.jobCardService.findAll(query);
  }

  @Get('dashboard')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Job card dashboard summary' })
  dashboard(@Query('companyId') companyId: string) {
    return this.jobCardService.getDashboard(companyId);
  }

  @Get('machine/:machineId')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Get job card history for a machine' })
  @ApiParam({ name: 'machineId', type: String })
  getMachineHistory(@Param('machineId') machineId: string) {
    return this.jobCardService.getMachineHistory(machineId);
  }

  @Get(':id')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Get job card by ID' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id') id: string) {
    return this.jobCardService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('maintenance.job_card.update')
  @ApiOperation({ summary: 'Update job card' })
  @ApiParam({ name: 'id', type: String })
  update(@Param('id') id: string, @Body() dto: UpdateJobCardDto, @CurrentUser() user: any) {
    return this.jobCardService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('maintenance.job_card.delete')
  @ApiOperation({ summary: 'Delete job card (OPEN only)' })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobCardService.remove(id, user.id);
  }

  @Post(':id/assign')
  @RequirePermission('maintenance.job_card.assign')
  @ApiOperation({ summary: 'Assign technicians to job card' })
  @ApiParam({ name: 'id', type: String })
  assign(@Param('id') id: string, @Body() dto: AssignJobCardDto, @CurrentUser() user: any) {
    return this.jobCardService.assign(id, dto, user.id);
  }

  @Post(':id/start')
  @RequirePermission('maintenance.job_card.start')
  @ApiOperation({ summary: 'Start working on job card' })
  @ApiParam({ name: 'id', type: String })
  start(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobCardService.start(id, user.id);
  }

  @Post(':id/hold')
  @RequirePermission('maintenance.job_card.hold')
  @ApiOperation({ summary: 'Put job card on hold' })
  @ApiParam({ name: 'id', type: String })
  hold(@Param('id') id: string, @CurrentUser() user: any, @Body('remarks') remarks?: string) {
    return this.jobCardService.hold(id, user.id, remarks);
  }

  @Post(':id/waiting-for-parts')
  @RequirePermission('maintenance.job_card.update')
  @ApiOperation({ summary: 'Mark job card as waiting for parts' })
  @ApiParam({ name: 'id', type: String })
  waitingForParts(@Param('id') id: string, @CurrentUser() user: any, @Body('remarks') remarks?: string) {
    return this.jobCardService.waitingForParts(id, user.id, remarks);
  }

  @Post(':id/resume')
  @RequirePermission('maintenance.job_card.update')
  @ApiOperation({ summary: 'Resume job card from hold/parts' })
  @ApiParam({ name: 'id', type: String })
  resume(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobCardService.resumeFromHold(id, user.id);
  }

  @Post(':id/complete')
  @RequirePermission('maintenance.job_card.complete')
  @ApiOperation({ summary: 'Complete job card' })
  @ApiParam({ name: 'id', type: String })
  complete(@Param('id') id: string, @Body() dto: { diagnosis?: string; correctiveAction?: string; preventiveAction?: string; rootCauseCategoryId?: string; failureCategoryId?: string; remarks?: string }, @CurrentUser() user: any) {
    return this.jobCardService.complete(id, dto, user.id);
  }

  @Post(':id/close')
  @RequirePermission('maintenance.job_card.close')
  @ApiOperation({ summary: 'Close job card' })
  @ApiParam({ name: 'id', type: String })
  close(@Param('id') id: string, @CurrentUser() user: any, @Body('remarks') remarks?: string) {
    return this.jobCardService.close(id, user.id, remarks);
  }

  @Post(':id/submit-for-verification')
  @RequirePermission('maintenance.job_card.close')
  @ApiOperation({ summary: 'Submit job card for verification' })
  @ApiParam({ name: 'id', type: String })
  submitForVerification(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobCardService.submitForVerification(id, user.id);
  }

  @Post(':id/verify')
  @RequirePermission('maintenance.job_card.verify')
  @ApiOperation({ summary: 'Verify job card' })
  @ApiParam({ name: 'id', type: String })
  verify(@Param('id') id: string, @CurrentUser() user: any, @Body('remarks') remarks?: string) {
    return this.jobCardService.verify(id, user.id, remarks);
  }

  @Post(':id/approve')
  @RequirePermission('maintenance.job_card.approve')
  @ApiOperation({ summary: 'Approve job card' })
  @ApiParam({ name: 'id', type: String })
  approve(@Param('id') id: string, @CurrentUser() user: any, @Body('remarks') remarks?: string) {
    return this.jobCardService.approve(id, user.id, remarks);
  }

  @Post(':id/reject')
  @RequirePermission('maintenance.job_card.verify')
  @ApiOperation({ summary: 'Reject job card' })
  @ApiParam({ name: 'id', type: String })
  reject(@Param('id') id: string, @Body() dto: RejectJobCardDto, @CurrentUser() user: any) {
    return this.jobCardService.reject(id, dto, user.id);
  }

  @Get(':id/parts')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Get spare parts used in job card' })
  @ApiParam({ name: 'id', type: String })
  getParts(@Param('id') id: string) {
    return this.jobCardService.getParts(id);
  }

  @Post(':id/parts')
  @RequirePermission('maintenance.job_card.update')
  @ApiOperation({ summary: 'Add spare part to job card' })
  @ApiParam({ name: 'id', type: String })
  addPart(@Param('id') id: string, @Body() dto: AddJobCardPartDto, @CurrentUser() user: any) {
    return this.jobCardService.addPart(id, dto, user.id);
  }

  @Delete(':id/parts/:partId')
  @RequirePermission('maintenance.job_card.update')
  @ApiOperation({ summary: 'Remove spare part from job card' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'partId', type: String })
  removePart(@Param('id') id: string, @Param('partId') partId: string) {
    return this.jobCardService.removePart(id, partId);
  }

  @Get(':id/work-logs')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Get work logs for job card' })
  @ApiParam({ name: 'id', type: String })
  getWorkLogs(@Param('id') id: string) {
    return this.jobCardService.getWorkLogs(id);
  }

  @Post(':id/work-logs')
  @RequirePermission('maintenance.job_card.update')
  @ApiOperation({ summary: 'Add work log to job card' })
  @ApiParam({ name: 'id', type: String })
  addWorkLog(@Param('id') id: string, @Body() dto: AddWorkLogDto, @CurrentUser() user: any) {
    return this.jobCardService.addWorkLog(id, dto, user.id);
  }

  @Get(':id/attachments')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Get attachments for job card' })
  @ApiParam({ name: 'id', type: String })
  getAttachments(@Param('id') id: string) {
    return this.jobCardService.getAttachments(id);
  }

  @Post(':id/attachments')
  @RequirePermission('maintenance.job_card.update')
  @ApiOperation({ summary: 'Add attachment to job card' })
  @ApiParam({ name: 'id', type: String })
  addAttachment(@Param('id') id: string, @Body() dto: { fileName: string; fileUrl: string; mimeType?: string; fileSize?: number; description?: string }, @CurrentUser() user: any) {
    return this.jobCardService.addAttachment(id, dto, user.id);
  }

  @Get(':id/history')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Get status history for job card' })
  @ApiParam({ name: 'id', type: String })
  getHistory(@Param('id') id: string) {
    return this.jobCardService.getHistory(id);
  }

  @Get(':id/technicians')
  @RequirePermission('maintenance.job_card.view')
  @ApiOperation({ summary: 'Get assigned technicians' })
  @ApiParam({ name: 'id', type: String })
  getTechnicians(@Param('id') id: string) {
    return this.jobCardService.getTechnicians(id);
  }
}
