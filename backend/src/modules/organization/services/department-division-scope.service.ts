import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentDivisionScope } from '../entities';

@Injectable()
export class DepartmentDivisionScopeService {
  constructor(
    @InjectRepository(DepartmentDivisionScope)
    private readonly scopeRepository: Repository<DepartmentDivisionScope>,
  ) {}

  async findByDepartment(departmentId: string): Promise<DepartmentDivisionScope[]> {
    return this.scopeRepository.find({
      where: { departmentId },
      relations: ['division'],
      order: { createdAt: 'ASC' },
    });
  }

  async findByDivision(divisionId: string): Promise<DepartmentDivisionScope[]> {
    return this.scopeRepository.find({
      where: { divisionId },
      relations: ['department'],
      order: { createdAt: 'ASC' },
    });
  }

  async addScope(departmentId: string, divisionId: string, userId?: string): Promise<DepartmentDivisionScope> {
    const existing = await this.scopeRepository.findOne({
      where: { departmentId, divisionId },
    });

    if (existing) {
      throw new ConflictException('Department is already scoped to this division');
    }

    const scope = this.scopeRepository.create({
      departmentId,
      divisionId,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.scopeRepository.save(scope);
  }

  async removeScope(departmentId: string, divisionId: string): Promise<void> {
    const scope = await this.scopeRepository.findOne({
      where: { departmentId, divisionId },
    });

    if (!scope) {
      throw new NotFoundException('Department scope not found for this division');
    }

    await this.scopeRepository.remove(scope);
  }

  async setScopes(departmentId: string, divisionIds: string[], userId?: string): Promise<DepartmentDivisionScope[]> {
    // Remove existing scopes
    await this.scopeRepository.delete({ departmentId });

    // Create new scopes
    if (divisionIds.length === 0) {
      return [];
    }

    const scopes = divisionIds.map((divisionId) =>
      this.scopeRepository.create({
        departmentId,
        divisionId,
        createdBy: userId,
        updatedBy: userId,
      }),
    );

    return this.scopeRepository.save(scopes);
  }
}
