import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErpUser } from '../../user/entities/erp-user.entity';

@Injectable()
export class MaintenanceUserResolverService {
  constructor(
    @InjectRepository(ErpUser)
    private readonly userRepo: Repository<ErpUser>,
  ) {}

  async resolve(authUserId: string): Promise<string> {
    const erpUser = await this.userRepo.findOne({ where: { authUserId, isActive: true } });
    if (!erpUser) {
      throw new NotFoundException('ERP user profile not found for the authenticated account');
    }
    return erpUser.id;
  }
}
