import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HrService } from '../services/hr.service';
import {
  CreateHrDesignationDto, CreateHrEmployeeDto, CreateHrAttendanceDto,
  CreateHrLeaveRequestDto, CreateHrLeaveTypeDto, CreateHrShiftDto, CreateHrHolidayDto,
} from '../dto';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';

@ApiTags('hr')
@Controller('hr')
@UseGuards(SupabaseJwtGuard)
@ApiBearerAuth()
export class HrController {
  constructor(private readonly hrService: HrService) {}

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
  @Get('employees')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.view')
  async listEmployees(
    @Query('companyId') companyId: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('search') search?: string, @Query('status') status?: string,
    @Query('departmentId') departmentId?: string, @Query('designationId') designationId?: string,
  ) {
    const result = await this.hrService.listEmployees(companyId, { page, limit, search, status, departmentId, designationId });
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

  @Patch('employees/:id')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.employee.update')
  async updateEmployee(@Param('id') id: string, @Body() dto: Partial<CreateHrEmployeeDto>) {
    const data = await this.hrService.updateEmployee(id, dto);
    return { success: true, data, message: 'Employee updated' };
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

  @Get('leave-requests')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.view')
  async listLeaveRequests(
    @Query('companyId') companyId: string, @Query('page') page?: number, @Query('limit') limit?: number,
    @Query('employeeId') employeeId?: string, @Query('status') status?: string,
  ) {
    const result = await this.hrService.listLeaveRequests(companyId, { page, limit, employeeId, status });
    return { success: true, ...result };
  }

  @Post('leave-requests')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.manage')
  async createLeaveRequest(@Body() dto: CreateHrLeaveRequestDto) {
    const data = await this.hrService.createLeaveRequest(dto);
    return { success: true, data, message: 'Leave request submitted' };
  }

  @Patch('leave-requests/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('hr.leave.manage')
  @HttpCode(HttpStatus.OK)
  async approveLeave(@Param('id') id: string, @Request() req: any) {
    const data = await this.hrService.approveLeave(id, req.user?.id);
    return { success: true, data, message: 'Leave approved' };
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
}