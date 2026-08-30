import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './modules/auth/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Detailed health check' })
  getDetailedHealth() {
    return this.appService.getDetailedHealth();
  }

  @Get('status')
  @Public()
  @ApiOperation({
    summary: 'System status check',
    description:
      'Reports real connectivity for backend, database and Supabase. Public because it only exposes non-sensitive status/host/port/provider values.',
  })
  async getStatus() {
    return this.appService.getStatus();
  }
}
