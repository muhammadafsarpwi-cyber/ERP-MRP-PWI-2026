import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, TreeRepository } from 'typeorm';
import { DepartmentService } from './department.service';
import { Department, DepartmentStatus, Division, Section, Company } from '../entities';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('DepartmentService', () => {
  let service: DepartmentService;
  let departmentRepo: any;
  let divisionRepo: any;
  let sectionRepo: any;
  let companyRepo: any;
  let dataSource: any;

  const companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
  const divisionId = 'd1000000-0000-0000-0000-000000000001';
  const sectionIdA = 's1000000-0000-0000-0000-000000000001';
  const sectionIdB = 's1000000-0000-0000-0000-000000000002';
  const userId = 'u1000000-0000-0000-0000-000000000001';

  const mockCompany = {
    id: companyId,
    legalName: 'Pakistan Wire Industries',
    status: 'ACTIVE',
  } as Company;

  const mockDivision = {
    id: divisionId,
    companyId,
    name: 'Spoke Division',
  } as Division;

  const mockSectionA = {
    id: sectionIdA,
    companyId,
    divisionId,
    name: 'Section A',
  } as Section;

  const mockSectionB = {
    id: sectionIdB,
    companyId,
    divisionId,
    name: 'Section B',
  } as Section;

  const mockDepartment: Department = {
    id: 'dept-123',
    departmentCode: 'DEPT-QA-01',
    name: 'Quality Department',
    companyId,
    divisionId,
    sectionId: sectionIdA,
    status: DepartmentStatus.ACTIVE,
    createdBy: userId,
    updatedBy: userId,
    createdAt: new Date('2026-09-17T08:00:00Z'),
    updatedAt: new Date('2026-09-17T08:00:00Z'),
    isActive: true,
    branchId: null as any,
    businessUnitId: null as any,
    description: 'Test Department',
    parentDepartmentId: null as any,
    parentDepartment: null as any,
    children: [],
    company: mockCompany,
    division: mockDivision,
    section: mockSectionA,
    branch: null as any,
    businessUnit: null as any,
    divisionScopes: [],
  };

  beforeEach(async () => {
    departmentRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    divisionRepo = {
      findOne: jest.fn(),
    };

    sectionRepo = {
      findOne: jest.fn(),
    };

    companyRepo = {
      findOne: jest.fn(),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([
        { id: userId, auth_user_id: 'auth-123', display_name: 'System Admin', email: 'system.admin@erp.com' },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentService,
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: getRepositoryToken(Section), useValue: sectionRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<DepartmentService>(DepartmentService);
  });

  describe('create', () => {
    it('should create department and set audit createdBy/updatedBy', async () => {
      companyRepo.findOne!.mockResolvedValue(mockCompany);
      divisionRepo.findOne!.mockResolvedValue(mockDivision);
      sectionRepo.findOne!.mockResolvedValue(mockSectionA);
      departmentRepo.findOne!.mockResolvedValueOnce(null).mockResolvedValueOnce({
        ...mockDepartment,
      });
      departmentRepo.create!.mockReturnValue(mockDepartment);
      departmentRepo.save!.mockResolvedValue(mockDepartment);

      const result = await service.create(
        {
          companyId,
          divisionId,
          sectionId: sectionIdA,
          departmentCode: 'DEPT-QA-01',
          name: 'Quality Department',
        },
        userId,
      );

      expect(companyRepo.findOne).toHaveBeenCalledWith({ where: { id: companyId } });
      expect(divisionRepo.findOne).toHaveBeenCalledWith({ where: { id: divisionId } });
      expect(sectionRepo.findOne).toHaveBeenCalledWith({ where: { id: sectionIdA } });
      expect(departmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: userId,
          updatedBy: userId,
        }),
      );
      expect(result.departmentCode).toBe('DEPT-QA-01');
      expect((result as any).createdByName).toBe('System Admin');
    });

    it('should reject duplicate department code in same company', async () => {
      companyRepo.findOne!.mockResolvedValue(mockCompany);
      divisionRepo.findOne!.mockResolvedValue(mockDivision);
      sectionRepo.findOne!.mockResolvedValue(mockSectionA);
      departmentRepo.findOne!.mockResolvedValue(mockDepartment);

      await expect(
        service.create(
          {
            companyId,
            divisionId,
            sectionId: sectionIdA,
            departmentCode: 'DEPT-QA-01',
            name: 'Quality Department',
          },
          userId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject section from a different division', async () => {
      companyRepo.findOne!.mockResolvedValue(mockCompany);
      divisionRepo.findOne!.mockResolvedValue(mockDivision);
      sectionRepo.findOne!.mockResolvedValue({
        ...mockSectionA,
        divisionId: 'different-div-id',
      } as Section);

      await expect(
        service.create(
          {
            companyId,
            divisionId,
            sectionId: sectionIdA,
            departmentCode: 'DEPT-MISMATCH',
            name: 'Mismatch Dept',
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update & section change persistence', () => {
    it('should update sectionId using direct repository update to persist change', async () => {
      // First findOne call returns initial department with sectionIdA
      departmentRepo.findOne!.mockResolvedValueOnce({
        ...mockDepartment,
        sectionId: sectionIdA,
      });

      // Hierarchy validation mocks
      divisionRepo.findOne!.mockResolvedValue(mockDivision);
      sectionRepo.findOne!.mockResolvedValue(mockSectionB);
      departmentRepo.update!.mockResolvedValue({ affected: 1 } as any);

      // Re-fetch after update returns updated department with sectionIdB
      departmentRepo.findOne!.mockResolvedValueOnce({
        ...mockDepartment,
        sectionId: sectionIdB,
        section: mockSectionB,
        updatedBy: userId,
      });

      const updated = await service.update(
        'dept-123',
        { sectionId: sectionIdB },
        userId,
      );

      expect(departmentRepo.update).toHaveBeenCalledWith(
        'dept-123',
        expect.objectContaining({
          sectionId: sectionIdB,
          updatedBy: userId,
        }),
      );
      expect(updated.sectionId).toBe(sectionIdB);
      expect((updated as any).updatedByName).toBe('System Admin');
    });

    it('should update name and updatedBy while preserving createdBy', async () => {
      departmentRepo.findOne!.mockResolvedValueOnce({
        ...mockDepartment,
      });
      divisionRepo.findOne!.mockResolvedValue(mockDivision);
      sectionRepo.findOne!.mockResolvedValue(mockSectionA);
      departmentRepo.update!.mockResolvedValue({ affected: 1 } as any);

      departmentRepo.findOne!.mockResolvedValueOnce({
        ...mockDepartment,
        name: 'New Name',
        updatedBy: userId,
      });

      const updated = await service.update(
        'dept-123',
        { name: 'New Name' },
        userId,
      );

      expect(departmentRepo.update).toHaveBeenCalledWith(
        'dept-123',
        expect.objectContaining({
          name: 'New Name',
          updatedBy: userId,
        }),
      );
      expect(updated.name).toBe('New Name');
      expect(updated.createdBy).toBe(userId);
    });
  });

  describe('remove', () => {
    it('should delete department when there are no child departments', async () => {
      departmentRepo.findOne!.mockResolvedValue(mockDepartment);
      departmentRepo.remove!.mockResolvedValue(mockDepartment);

      await expect(service.remove('dept-123')).resolves.toBeUndefined();
      expect(departmentRepo.remove).toHaveBeenCalledWith(mockDepartment);
    });

    it('should catch foreign key violation and throw user-friendly BadRequestException', async () => {
      departmentRepo.findOne!.mockResolvedValue(mockDepartment);
      departmentRepo.remove!.mockRejectedValue({ code: '23503', message: 'foreign key constraint' });

      await expect(service.remove('dept-123')).rejects.toThrow(BadRequestException);
    });
  });
});
