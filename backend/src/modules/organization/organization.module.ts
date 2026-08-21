import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company, Branch, BusinessUnit, Department, DepartmentDivisionScope, Division, Section, Warehouse, WarehouseLocation } from './entities';
import { CompanyService, BranchService, BusinessUnitService, DepartmentService, DepartmentDivisionScopeService, DivisionService, SectionService, WarehouseService, WarehouseLocationService } from './services';
import { CompanyController, BranchController, BusinessUnitController, DepartmentController, DepartmentDivisionScopeController, DivisionController, SectionController, WarehouseController, WarehouseLocationController } from './controllers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Branch,
      BusinessUnit,
      Department,
      DepartmentDivisionScope,
      Division,
      Section,
      Warehouse,
      WarehouseLocation,
    ]),
  ],
  controllers: [
    CompanyController,
    BranchController,
    BusinessUnitController,
    DepartmentController,
    DepartmentDivisionScopeController,
    DivisionController,
    SectionController,
    WarehouseController,
    WarehouseLocationController,
  ],
  providers: [
    CompanyService,
    BranchService,
    BusinessUnitService,
    DepartmentService,
    DepartmentDivisionScopeService,
    DivisionService,
    SectionService,
    WarehouseService,
    WarehouseLocationService,
  ],
  exports: [
    CompanyService,
    BranchService,
    BusinessUnitService,
    DepartmentService,
    DepartmentDivisionScopeService,
    DivisionService,
    SectionService,
    WarehouseService,
    WarehouseLocationService,
  ],
})
export class OrganizationModule {}
