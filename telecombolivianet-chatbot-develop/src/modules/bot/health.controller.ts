import { Controller, Get } from '@nestjs/common';
import { HealthService, HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthSvc: HealthService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    return this.healthSvc.check();
  }
}
