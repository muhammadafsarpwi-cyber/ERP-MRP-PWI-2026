import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { DepartmentDivisionScopeService } from '../services';

@ApiTags('organization/department-division-scopes')
@Controller('department-division-scopes')
export class DepartmentDivisionScopeController {
  constructor(private readonly scopeService: DepartmentDivisionScopeService) {}

  @Get('department/:departmentId')
  @ApiOperation({ summary: 'Get all division scopes for a department' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  async findByDepartment(@Param('departmentId') departmentId: string) {
    const scopes = await this.scopeService.findByDepartment(departmentId);
    return { success: true, data: scopes };
  }

  @Get('division/:divisionId')
  @ApiOperation({ summary: 'Get all department scopes for a division' })
  @ApiParam({ name: 'divisionId', description: 'Division ID' })
  async findByDivision(@Param('divisionId') divisionId: string) {
    const scopes = await this.scopeService.findByDivision(divisionId);
    return { success: true, data: scopes };
  }

  @Post()
  @ApiOperation({ summary: 'Add a division scope to a department' })
  @ApiBody({ schema: { properties: { departmentId: { type: 'string' }, divisionId: { type: 'string' } }, required: ['departmentId', 'divisionId'] } })
  async addScope(@Body() body: { departmentId: string; divisionId: string }) {
    const scope = await this.scopeService.addScope(body.departmentId, body.divisionId);
    return { success: true, data: scope, message: 'Scope added successfully' };
  }

  @Delete('department/:departmentId/division/:divisionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a division scope from a department' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiParam({ name: 'divisionId', description: 'Division ID' })
  async removeScope(
    @Param('departmentId') departmentId: string,
    @Param('divisionId') divisionId: string,
  ) {
    await this.scopeService.removeScope(departmentId, divisionId);
  }
}
