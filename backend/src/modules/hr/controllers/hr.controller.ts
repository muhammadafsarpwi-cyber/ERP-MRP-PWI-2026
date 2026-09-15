import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HrService } from '../services/hr.service';
import { HrRegularizationsService } from '../services/hr-regularizations.service';
import { HrOvertimeService } from '../services/hr-overtime.service';
import { HrAdvancesService } from '../services/hr-advances.service';
import {
  CreateHrDesignationDto, CreateHrEmployeeDto, CreateHrAttendanceDto,
  CreateHrLeaveRequestDto, UpdateHrLeaveRequestDto, ApproveHrLeaveDto, RejectHrLeaveDto,
  CreateHrLeaveTypeDto, CreateHrShiftDto, CreateHrHolidayDto,
  GetMyAttendanceDto, GetAttendanceRegisterDto, GetShiftRosterDto, GetLiveMapDto,
  CreateHrShiftRosterDto, UpdateHrShiftRosterDto, GetLeaveRequestsDto,
  CreateRegularizationDto, UpdateRegularizationDto, RegularizationDecisionDto, GetRegularizationsDto,
  CreateOvertimeDto, UpdateOvertimeDto, ApproveOvertimeDto, RejectOvertimeDto, GetOvertimeDto,
  CreateAdvanceDto, UpdateAdvanceDto, ApproveAdvanceDto, RejectAdvanceDto,
  DisburseAdvanceDto, RecoverAdvanceDto, GetAdvancesDto,
} from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('hr')
@Controller('hr')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class HrController {
  constructor(
    private readonly hrService: HrService,
    private readonly regularizationService: HrRegularizationsService,
    private readonly overtimeService: HrOvertimeService,
    private readonly advancesService: HrAdvancesService,
  ) {}

  // ---- Shift Roster ----
  @Get('shift-roster/options')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.shift_roster.view')
  async shiftRosterOptions(@Request() req: any) {
    const data = await this.hrService.getShiftRosterOptions(req.user?.id);
    return { success: true, data };
  }

  @Get('shift-roster')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.shift_roster.view')
  async shiftRoster(@Query() query: GetShiftRosterDto, @Request() req: any) {
    const data = await this.hrService.getShiftRoster(req.user?.id, query);
    return { success: true, data };
  }

  @Get('shift-roster/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.shift_roster.view')
  async shiftRosterById(@Param('id') id: string, @Request() req: any) {
    const data = await this.hrService.getShiftRosterById(req.user?.id, id);
    return { success: true, data };
  }

  @Post('shift-roster')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.shift_roster.create')
  async createShiftRoster(@Body() dto: CreateHrShiftRosterDto, @Request() req: any) {
    const data = await this.hrService.createShiftRoster(req.user?.id, dto);
    return { success: true, data, message: 'Shift assignment created' };
  }

  @Patch('shift-roster/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.shift_roster.update')
  async updateShiftRoster(@Param('id') id: string, @Body() dto: UpdateHrShiftRosterDto, @Request() req: any) {
    const data = await this.hrService.updateShiftRoster(req.user?.id, id, dto);
    return { success: true, data, message: 'Shift assignment updated' };
  }

  @Delete('shift-roster/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.shift_roster.delete')
  @HttpCode(HttpStatus.OK)
  async deleteShiftRoster(@Param('id') id: string, @Request() req: any) {
    const data = await this.hrService.softDeleteShiftRoster(req.user?.id, id);
    return { success: true, data, message: 'Shift assignment removed' };
  }

  // ---- Live Map ----
  @Get('live-map/options')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.live_map.view')
  async liveMapOptions(@Request() req: any) {
    const data = await this.hrService.getLiveMapOptions(req.user?.id);
    return { success: true, data };
  }

  @Get('live-map')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.live_map.view')
  async liveMap(@Query() query: GetLiveMapDto, @Request() req: any) {
    const data = await this.hrService.getLiveMap(req.user?.id, query);
    return { success: true, data };
  }

  // ---- Designations ----
  @Get('designations')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.designation.view')
  async listDesignations(@Query('companyId') companyId: string) {
    const data = await this.hrService.listDesignations(companyId);
    return { success: true, data };
  }

  @Post('designations')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.designation.manage')
  async createDesignation(@Body() dto: CreateHrDesignationDto) {
    const data = await this.hrService.createDesignation(dto);
    return { success: true, data, message: 'Designation created' };
  }

  // ---- Employees ----
  @Get('employees/lookup')
  async employeeLookup(@Request() req: any, @Query('departmentId') departmentId?: string) {
    try {
      const data = await this.hrService.getEmployeeLookup(req.user?.id, departmentId);
      return { success: true, data: Array.isArray(data) ? data : [] };
    } catch {
      return { success: true, data: [] };
    }
  }

  @Get('employees')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.view')
  async listEmployees(
    @Request() req: any,
    @Query('companyId') companyId?: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('departmentId') departmentId?: string, @Query('designationId') designationId?: string,
    @Query('divisionId') divisionId?: string, @Query('sectionId') sectionId?: string,
  ) {
    const effectiveCompanyId = companyId || req.user?.defaultCompanyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    const result = await this.hrService.listEmployees(effectiveCompanyId, { page, limit, search, status, departmentId, designationId, divisionId, sectionId });
    return { success: true, ...result };
  }

  @Get('employees/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.view')
  async findEmployee(@Param('id') id: string) {
    const data = await this.hrService.findEmployee(id);
    return { success: true, data };
  }

  @Post('employees')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.create')
  async createEmployee(@Body() dto: CreateHrEmployeeDto) {
    const data = await this.hrService.createEmployee(dto);
    return { success: true, data, message: 'Employee created' };
  }

  @Post('employees/bulk')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.create')
  async bulkImportEmployees(@Body() body: { companyId: string; employees: any[] }) {
    const data = await this.hrService.bulkImportEmployees(body.companyId, body.employees || []);
    return { success: true, data, message: `Processed ${data.total} employees: ${data.created} created, ${data.updated} updated.` };
  }

  @Patch('employees/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.update')
  async updateEmployee(@Param('id') id: string, @Body() dto: Partial<CreateHrEmployeeDto>) {
    const data = await this.hrService.updateEmployee(id, dto);
    return { success: true, data, message: 'Employee updated' };
  }

  @Delete('employees/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.delete')
  async deleteEmployee(@Param('id') id: string) {
    const data = await this.hrService.deleteEmployee(id);
    return { success: true, data, message: 'Employee status toggled' };
  }

  @Post('employees/:id/skills')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.update')
  async addSkill(@Param('id') id: string, @Body() dto: any) {
    const data = await this.hrService.addSkill(id, dto);
    return { success: true, data, message: 'Skill added' };
  }

  @Post('employees/:id/training')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.update')
  async addTraining(@Param('id') id: string, @Body() dto: any) {
    const data = await this.hrService.addTraining(id, dto);
    return { success: true, data, message: 'Training added' };
  }

  @Post('employees/:id/documents')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.update')
  async addDocument(@Param('id') id: string, @Body() dto: any) {
    const data = await this.hrService.addDocument(id, dto);
    return { success: true, data, message: 'Document added' };
  }

  @Get('employees/:id/histories')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.view')
  async listHistories(@Param('id') id: string) {
    const data = await this.hrService.listHistories(id);
    return { success: true, data };
  }

  // ---- Attendance ----
  @Get('my-attendance')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.view')
  async myAttendance(@Query() query: GetMyAttendanceDto, @Request() req: any) {
    const data = await this.hrService.getMyAttendance(req.user?.id, query);
    return { success: true, data };
  }

  @Get('attendance-register/options')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.view')
  async attendanceRegisterOptions(@Request() req: any) {
    const data = await this.hrService.getAttendanceRegisterOptions(req.user?.id);
    return { success: true, data };
  }

  @Get('attendance-register')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.view')
  async attendanceRegister(@Query() query: GetAttendanceRegisterDto, @Request() req: any) {
    const data = await this.hrService.getAttendanceRegister(req.user?.id, query);
    return { success: true, data };
  }

  @Get('attendance')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.view')
  async listAttendance(
    @Query('companyId') companyId: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('employeeId') employeeId?: string, @Query('from') from?: string, @Query('to') to?: string,
  ) {
    const result = await this.hrService.listAttendance(companyId, { page, limit, employeeId, from, to });
    return { success: true, ...result };
  }

  @Post('attendance')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.manage')
  async recordAttendance(@Body() dto: CreateHrAttendanceDto) {
    const data = await this.hrService.recordAttendance(dto);
    return { success: true, data, message: 'Attendance recorded' };
  }

  // ---- Leave ----
  @Get('leave-types')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.view')
  async listLeaveTypes(@Query('companyId') companyId: string) {
    const data = await this.hrService.listLeaveTypes(companyId);
    return { success: true, data };
  }

  @Post('leave-types')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.manage')
  async createLeaveType(@Body() dto: CreateHrLeaveTypeDto) {
    const data = await this.hrService.createLeaveType(dto);
    return { success: true, data, message: 'Leave type created' };
  }

  @Get('leave-requests/options')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.view')
  async leaveRequestOptions(@Request() req: any) {
    const data = await this.hrService.getLeaveRequestOptions(req.user?.id);
    return { success: true, data };
  }

  @Get('leave-requests')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.view')
  async listLeaveRequests(@Query() query: GetLeaveRequestsDto, @Request() req: any) {
    const data = await this.hrService.listLeaveRequests(req.user?.id, query);
    return { success: true, data };
  }

  @Get('leave-requests/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.view')
  async leaveRequestById(@Param('id') id: string, @Request() req: any) {
    const data = await this.hrService.getLeaveRequestById(req.user?.id, id);
    return { success: true, data };
  }

  @Post('leave-requests')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.create')
  async createLeaveRequest(@Body() dto: CreateHrLeaveRequestDto, @Request() req: any) {
    const data = await this.hrService.createLeaveRequest(req.user?.id, dto);
    return { success: true, data, message: 'Leave request submitted' };
  }

  @Patch('leave-requests/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.update')
  async updateLeaveRequest(@Param('id') id: string, @Body() dto: UpdateHrLeaveRequestDto, @Request() req: any) {
    const data = await this.hrService.updateLeaveRequest(req.user?.id, id, dto);
    return { success: true, data, message: 'Leave request updated' };
  }

  @Delete('leave-requests/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.delete')
  @HttpCode(HttpStatus.OK)
  async deleteLeaveRequest(@Param('id') id: string, @Request() req: any) {
    const data = await this.hrService.deleteLeaveRequest(req.user?.id, id);
    return { success: true, data, message: 'Leave request removed' };
  }

  @Patch('leave-requests/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.manage')
  @HttpCode(HttpStatus.OK)
  async approveLeave(@Param('id') id: string, @Body() dto: ApproveHrLeaveDto, @Request() req: any) {
    const data = await this.hrService.approveLeave(req.user?.id, id, dto);
    return { success: true, data, message: 'Leave approved' };
  }

  @Patch('leave-requests/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.manage')
  @HttpCode(HttpStatus.OK)
  async rejectLeave(@Param('id') id: string, @Body() dto: RejectHrLeaveDto, @Request() req: any) {
    const data = await this.hrService.rejectLeave(req.user?.id, id, dto);
    return { success: true, data, message: 'Leave rejected' };
  }

  @Patch('leave-requests/:id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.manage')
  @HttpCode(HttpStatus.OK)
  async cancelLeave(@Param('id') id: string, @Request() req: any) {
    const data = await this.hrService.cancelLeave(req.user?.id, id);
    return { success: true, data, message: 'Leave cancelled' };
  }

  // ---- Shifts ----
  @Get('shifts')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.view')
  async listShifts(@Query('companyId') companyId: string) {
    const data = await this.hrService.listShifts(companyId);
    return { success: true, data };
  }

  @Post('shifts')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.manage')
  async createShift(@Body() dto: CreateHrShiftDto) {
    const data = await this.hrService.createShift(dto);
    return { success: true, data, message: 'Shift created' };
  }

  // ---- Holidays ----
  @Get('holidays')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.view')
  async listHolidays(@Query('companyId') companyId: string) {
    const data = await this.hrService.listHolidays(companyId);
    return { success: true, data };
  }

  @Post('holidays')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.attendance.manage')
  async createHoliday(@Body() dto: CreateHrHolidayDto) {
    const data = await this.hrService.createHoliday(dto);
    return { success: true, data, message: 'Holiday created' };
  }

  // ---- Attendance Regularizations ----
  @Get('regularizations/options')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.view')
  async regularizationOptions(@Request() req: any) {
    const data = await this.regularizationService.getRegularizationOptions(req.user?.id);
    return { success: true, data };
  }

  @Get('regularizations')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.view')
  async listRegularizations(@Query() query: GetRegularizationsDto, @Request() req: any) {
    const data = await this.regularizationService.listRegularizations(req.user?.id, query);
    return { success: true, data };
  }

  @Get('regularizations/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.view')
  async regularizationById(@Param('id') id: string, @Request() req: any) {
    const data = await this.regularizationService.getById(req.user?.id, id);
    return { success: true, data };
  }

  @Post('regularizations')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.create')
  async createRegularization(@Body() dto: CreateRegularizationDto, @Request() req: any) {
    const data = await this.regularizationService.create(req.user?.id, dto);
    return { success: true, data, message: 'Regularization submitted successfully.' };
  }

  @Patch('regularizations/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.update')
  async updateRegularization(@Param('id') id: string, @Body() dto: UpdateRegularizationDto, @Request() req: any) {
    const data = await this.regularizationService.update(req.user?.id, id, dto);
    return { success: true, data, message: 'Regularization updated' };
  }

  @Delete('regularizations/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.delete')
  @HttpCode(HttpStatus.OK)
  async deleteRegularization(@Param('id') id: string, @Request() req: any) {
    const data = await this.regularizationService.delete(req.user?.id, id);
    return { success: true, data, message: 'Regularization removed' };
  }

  @Patch('regularizations/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.approve')
  @HttpCode(HttpStatus.OK)
  async approveRegularization(@Param('id') id: string, @Body() dto: RegularizationDecisionDto, @Request() req: any) {
    const data = await this.regularizationService.approve(req.user?.id, id, dto);
    return { success: true, data, message: 'Regularization approved successfully.' };
  }

  @Patch('regularizations/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.regularization.approve')
  @HttpCode(HttpStatus.OK)
  async rejectRegularization(@Param('id') id: string, @Body() dto: RegularizationDecisionDto, @Request() req: any) {
    const data = await this.regularizationService.reject(req.user?.id, id, dto);
    return { success: true, data, message: 'Regularization rejected.' };
  }

  // ---- Overtime Approvals ----
  @Get('overtime/options')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.view')
  async overtimeOptions(@Request() req: any) {
    const data = await this.overtimeService.getOvertimeOptions(req.user?.id);
    return { success: true, data };
  }

  @Get('overtime')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.view')
  async listOvertime(@Query() query: GetOvertimeDto, @Request() req: any) {
    const data = await this.overtimeService.listOvertime(req.user?.id, query);
    return { success: true, data };
  }

  @Get('overtime/:id/history')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.view')
  async overtimeHistory(@Param('id') id: string, @Request() req: any) {
    const detail = await this.overtimeService.getById(req.user?.id, id);
    return { success: true, data: detail.history ?? [] };
  }

  @Get('overtime/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.view')
  async overtimeById(@Param('id') id: string, @Request() req: any) {
    const data = await this.overtimeService.getById(req.user?.id, id);
    return { success: true, data };
  }

  @Post('overtime')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.create')
  async createOvertime(@Body() dto: CreateOvertimeDto, @Request() req: any) {
    const data = await this.overtimeService.create(req.user?.id, dto);
    return { success: true, data, message: 'Overtime request submitted successfully.' };
  }

  @Patch('overtime/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.update')
  async updateOvertime(@Param('id') id: string, @Body() dto: UpdateOvertimeDto, @Request() req: any) {
    const data = await this.overtimeService.update(req.user?.id, id, dto);
    return { success: true, data, message: 'Overtime request updated' };
  }

  @Patch('overtime/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.approve')
  @HttpCode(HttpStatus.OK)
  async approveOvertime(@Param('id') id: string, @Body() dto: ApproveOvertimeDto, @Request() req: any) {
    const data = await this.overtimeService.approve(req.user?.id, id, dto);
    return { success: true, data, message: 'Overtime approved successfully.' };
  }

  @Patch('overtime/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.approve')
  @HttpCode(HttpStatus.OK)
  async rejectOvertime(@Param('id') id: string, @Body() dto: RejectOvertimeDto, @Request() req: any) {
    const data = await this.overtimeService.reject(req.user?.id, id, dto);
    return { success: true, data, message: 'Overtime rejected.' };
  }

  @Delete('overtime/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.overtime.delete')
  @HttpCode(HttpStatus.OK)
  async deleteOvertime(@Param('id') id: string, @Request() req: any) {
    const data = await this.overtimeService.delete(req.user?.id, id);
    return { success: true, data, message: 'Overtime request removed' };
  }

  // ---- Employee Advances ----
  @Get('advances/options')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.view')
  async getAdvanceOptions(@Request() req: any) {
    const data = await this.advancesService.getAdvanceOptions(req.user?.id);
    return { success: true, data };
  }

  @Get('advances')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.view')
  async listAdvances(@Request() req: any, @Query() query: GetAdvancesDto) {
    const data = await this.advancesService.listAdvances(req.user?.id, query as Record<string, any>);
    return { success: true, data };
  }

  @Get('advances/:id/history')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.view')
  async getAdvanceDetailWithHistory(@Param('id') id: string, @Request() req: any) {
    const data = await this.advancesService.getById(req.user?.id, id);
    return { success: true, data };
  }

  @Get('advances/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.view')
  async getAdvanceDetail(@Param('id') id: string, @Request() req: any) {
    const data = await this.advancesService.getById(req.user?.id, id);
    return { success: true, data };
  }

  @Post('advances')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.create')
  @HttpCode(HttpStatus.CREATED)
  async createAdvance(@Body() dto: CreateAdvanceDto, @Request() req: any) {
    const data = await this.advancesService.create(req.user?.id, dto);
    return { success: true, data, message: 'Advance request created' };
  }

  @Patch('advances/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.update')
  @HttpCode(HttpStatus.OK)
  async updateAdvance(@Param('id') id: string, @Body() dto: UpdateAdvanceDto, @Request() req: any) {
    const data = await this.advancesService.update(req.user?.id, id, dto);
    return { success: true, data, message: 'Advance updated' };
  }

  @Patch('advances/:id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.update')
  @HttpCode(HttpStatus.OK)
  async submitAdvance(@Param('id') id: string, @Request() req: any) {
    const data = await this.advancesService.submit(req.user?.id, id);
    return { success: true, data, message: 'Advance submitted for approval' };
  }

  @Delete('advances/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.delete')
  @HttpCode(HttpStatus.OK)
  async deleteAdvance(@Param('id') id: string, @Request() req: any) {
    const data = await this.advancesService.delete(req.user?.id, id);
    return { success: true, data, message: 'Advance request removed' };
  }

  @Patch('advances/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.approve')
  @HttpCode(HttpStatus.OK)
  async approveAdvance(@Param('id') id: string, @Body() dto: ApproveAdvanceDto, @Request() req: any) {
    const data = await this.advancesService.approve(req.user?.id, id, dto);
    return { success: true, data, message: 'Advance approved' };
  }

  @Patch('advances/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.reject')
  @HttpCode(HttpStatus.OK)
  async rejectAdvance(@Param('id') id: string, @Body() dto: RejectAdvanceDto, @Request() req: any) {
    const data = await this.advancesService.reject(req.user?.id, id, dto);
    return { success: true, data, message: 'Advance rejected' };
  }

  @Post('advances/:id/disburse')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.disburse')
  @HttpCode(HttpStatus.OK)
  async disburseAdvance(@Param('id') id: string, @Body() dto: DisburseAdvanceDto, @Request() req: any) {
    const data = await this.advancesService.disburse(req.user?.id, id, dto);
    return { success: true, data, message: 'Loan disbursed' };
  }

  @Post('advances/:id/recover')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.advance.recover')
  @HttpCode(HttpStatus.OK)
  async recoverAdvance(@Param('id') id: string, @Body() dto: RecoverAdvanceDto, @Request() req: any) {
    const data = await this.advancesService.recover(req.user?.id, id, dto);
    return { success: true, data, message: 'Loan recovery recorded' };
  }
}