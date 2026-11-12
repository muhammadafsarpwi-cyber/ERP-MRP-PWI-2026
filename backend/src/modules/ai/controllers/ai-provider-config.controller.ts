import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard } from '../../auth/guards/org-scope.guard';
import { PermissionGuard, RequirePermission } from '../../auth/guards/permission.guard';
import { AiProviderConfigService } from '../services/ai-provider-config.service';
import {
  CreateAiProviderConfigDto,
  ListAiProviderModelsDto,
  TestAiProviderConnectionDto,
  UpdateAiProviderConfigDto,
} from '../dto/ai-provider-config.dto';

@ApiTags('ai/settings/providers')
@Controller('ai/settings/providers')
@UseGuards(SupabaseJwtGuard, OrgScopeGuard)
@ApiBearerAuth()
export class AiProviderConfigController {
  constructor(private readonly service: AiProviderConfigService) {}

  private extractOrgId(req: any): string | undefined {
    return req.user?.companyId || req.user?.defaultCompanyId || req.companyId;
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.settings')
  @ApiOperation({
    summary: 'List saved AI providers with masked API keys and active engine status',
  })
  async list(@Req() req: any) {
    const orgId = this.extractOrgId(req);
    const data = await this.service.listConfigs(orgId);
    return { success: true, data };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.settings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create and encrypt a new AI provider configuration' })
  async create(@Body() dto: CreateAiProviderConfigDto, @Req() req: any) {
    const orgId = this.extractOrgId(req);
    const data = await this.service.create(dto, orgId);
    return { success: true, data, message: 'AI provider profile created successfully.' };
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.settings')
  @ApiOperation({ summary: 'Update an existing AI provider profile' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAiProviderConfigDto,
    @Req() req: any,
  ) {
    const orgId = this.extractOrgId(req);
    const data = await this.service.update(id, dto, orgId);
    return { success: true, data, message: 'AI provider profile updated successfully.' };
  }

  @Patch(':id/set-primary')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.settings')
  @ApiOperation({ summary: 'Set provider as the active primary default engine' })
  async setPrimary(@Param('id') id: string, @Req() req: any) {
    const orgId = this.extractOrgId(req);
    const data = await this.service.setPrimary(id, orgId);
    return { success: true, data, message: `Active primary AI engine set to ${data.configurationLabel}.` };
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.settings')
  @ApiOperation({ summary: 'Delete an AI provider configuration profile' })
  async remove(@Param('id') id: string) {
    const res = await this.service.delete(id);
    return { success: true, message: res.message };
  }

  @Post('test-connection')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test live connectivity to an AI provider without saving' })
  async testConnection(@Body() dto: TestAiProviderConnectionDto) {
    const result = await this.service.testConnection(dto);
    return { success: true, data: result };
  }

  @Post('list-models')
  @UseGuards(PermissionGuard)
  @RequirePermission('ai.settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch live model IDs and quota information available for a provider API key' })
  async listModels(@Body() dto: ListAiProviderModelsDto) {
    const data = await this.service.listModels(dto);
    return { success: true, data };
  }
}

