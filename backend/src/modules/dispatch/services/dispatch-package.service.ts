import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  DispatchPackage,
  DispatchPackageStatus,
} from '../entities/dispatch-package.entity';
import {
  DispatchPackageUnit,
  DispatchPackageUnitStatus,
} from '../entities/dispatch-package-unit.entity';
import {
  DispatchPackageAuditLog,
  DispatchPackageAction,
} from '../entities/dispatch-package-audit.entity';
import {
  CreateDispatchPackageDto,
  ScanAddUnitDto,
  RemoveUnitDto,
  FinalizePackageDto,
  LinkGatePassDto,
  GateExitDto,
  CancelPackageDto,
  QueryDispatchPackageDto,
} from '../dto';
import {
  ProductionUnit,
  ProductionUnitStatus,
} from '../../production/entities/production-unit.entity';
import { SalesDelivery } from '../../sales/entities/sales-delivery.entity';

@Injectable()
export class DispatchPackageService {
  constructor(
    @InjectRepository(DispatchPackage)
    private readonly packageRepo: Repository<DispatchPackage>,
    @InjectRepository(DispatchPackageUnit)
    private readonly unitRepo: Repository<DispatchPackageUnit>,
    @InjectRepository(DispatchPackageAuditLog)
    private readonly auditRepo: Repository<DispatchPackageAuditLog>,
    @InjectRepository(ProductionUnit)
    private readonly prodUnitRepo: Repository<ProductionUnit>,
    @InjectRepository(SalesDelivery)
    private readonly deliveryRepo: Repository<SalesDelivery>,
    private readonly dataSource: DataSource,
  ) {}

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CREATE OPEN PACKAGE
  // ════════════════════════════════════════════════════════════════════════════

  async createPackage(
    dto: CreateDispatchPackageDto,
    companyId: string,
    userId?: string,
    userName?: string,
  ): Promise<DispatchPackage> {
    const packageNo = await this.generateNextPackageNo(companyId);

    const pkg = this.packageRepo.create({
      companyId,
      packageNo,
      packageQrPayload: packageNo,
      customerId: dto.customerId || null,
      customerName: dto.customerName || null,
      salesOrderId: dto.salesOrderId || null,
      salesOrderNo: dto.salesOrderNo || null,
      salesDeliveryId: dto.salesDeliveryId || null,
      gatePassNo: dto.gatePassNo || null,
      warehouseId: dto.warehouseId || null,
      warehouseName: dto.warehouseName || null,
      packageDate: dto.packageDate || new Date().toISOString().split('T')[0],
      status: DispatchPackageStatus.OPEN,
      vehicleNo: dto.vehicleNo || null,
      driverName: dto.driverName || null,
      driverPhone: dto.driverPhone || null,
      dispatchLocation: dto.dispatchLocation || null,
      remarks: dto.remarks || null,
      totalUnits: 0,
      totalWeightKg: 0,
      totalLengthMeters: 0,
      createdBy: userId || null,
    });

    const saved = await this.packageRepo.save(pkg);

    await this.recordAudit(
      saved.id,
      companyId,
      DispatchPackageAction.PACKAGE_CREATED,
      null,
      null,
      { packageNo, customerName: dto.customerName },
      userId,
      userName,
    );

    return saved;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 2. LIST & GET
  // ════════════════════════════════════════════════════════════════════════════

  async findAll(
    query: QueryDispatchPackageDto,
    companyId: string,
  ): Promise<{ data: DispatchPackage[]; total: number }> {
    const { search, status, customerId, salesOrderId, page = 1, limit = 20 } = query;

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .where('pkg.companyId = :companyId', { companyId })
      .andWhere('pkg.isActive = true');

    if (status) {
      qb.andWhere('pkg.status = :status', { status });
    }

    if (customerId) {
      qb.andWhere('pkg.customerId = :customerId', { customerId });
    }

    if (salesOrderId) {
      qb.andWhere('pkg.salesOrderId = :salesOrderId', { salesOrderId });
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      qb.andWhere(
        '(pkg.packageNo ILIKE :s OR pkg.customerName ILIKE :s OR pkg.salesOrderNo ILIKE :s OR pkg.gatePassNo ILIKE :s OR pkg.vehicleNo ILIKE :s OR pkg.driverName ILIKE :s)',
        { s },
      );
    }

    qb.orderBy('pkg.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId: string): Promise<DispatchPackage> {
    const pkg = await this.packageRepo.findOne({
      where: { id, companyId, isActive: true },
      relations: ['units', 'auditLogs', 'salesDelivery'],
    });

    if (!pkg) {
      throw new NotFoundException(`Dispatch package ${id} not found`);
    }

    // Filter units to active packed items only and sort chronologically
    if (pkg.units) {
      pkg.units = pkg.units
        .filter((u) => u.status === DispatchPackageUnitStatus.PACKED)
        .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
    }

    if (pkg.auditLogs) {
      pkg.auditLogs = pkg.auditLogs.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    return pkg;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. SCAN & ADD PRODUCTION UNIT (Continuous Rapid Mobile Scan)
  // ════════════════════════════════════════════════════════════════════════════

  async scanAndAddUnit(
    packageId: string,
    dto: ScanAddUnitDto,
    companyId: string,
    userId?: string,
    userName?: string,
  ): Promise<{ package: DispatchPackage; addedUnit: DispatchPackageUnit }> {
    const cleanPayload = (dto.payload || '').trim();
    if (!cleanPayload) {
      throw new BadRequestException('QR or Barcode payload cannot be empty');
    }

    // 1. Ensure package exists and is OPEN
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, companyId, isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Dispatch package ${packageId} not found`);
    }

    if (pkg.status !== DispatchPackageStatus.OPEN) {
      throw new BadRequestException(
        `Cannot add units: Package ${pkg.packageNo} is already ${pkg.status}`,
      );
    }

    // 2. Resolve Production Unit by QR, barcode, serial number, or coil number
    const prodUnit = await this.prodUnitRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.item', 'item')
      .where('u.companyId = :companyId', { companyId })
      .andWhere(
        '(u.qrPayload = :p OR u.barcodePayload = :p OR u.unitSerialNo = :p OR u.coilNo = :p)',
        { p: cleanPayload },
      )
      .andWhere('u.isActive = true')
      .getOne();

    if (!prodUnit) {
      throw new NotFoundException(
        `Production Unit not found for scanned code "${cleanPayload}"`,
      );
    }

    // 3. Check Production Unit status
    if (
      [ProductionUnitStatus.VOID, ProductionUnitStatus.CANCELLED].includes(
        prodUnit.status,
      )
    ) {
      throw new BadRequestException(
        `Cannot dispatch: Production Unit ${prodUnit.coilNo} (${prodUnit.unitSerialNo}) is marked as ${prodUnit.status}`,
      );
    }

    // 4. Duplicate Check 1: Is this unit ALREADY in THIS package?
    const inCurrentPkg = await this.unitRepo.findOne({
      where: {
        packageId: pkg.id,
        productionUnitId: prodUnit.id,
        status: DispatchPackageUnitStatus.PACKED,
      },
    });

    if (inCurrentPkg) {
      throw new ConflictException(
        `ALREADY IN THIS PACKAGE: Coil ${prodUnit.coilNo} (${prodUnit.unitSerialNo}) is already added to Package ${pkg.packageNo}`,
      );
    }

    // 5. Duplicate Check 2: Is this unit already assigned to ANOTHER active/finalized package?
    const otherPkgUnit = await this.unitRepo.findOne({
      where: {
        productionUnitId: prodUnit.id,
        status: DispatchPackageUnitStatus.PACKED,
      },
      relations: ['package'],
    });

    if (otherPkgUnit && otherPkgUnit.packageId !== pkg.id) {
      const otherPkg = otherPkgUnit.package;
      if (
        otherPkg &&
        [DispatchPackageStatus.OPEN, DispatchPackageStatus.FINALIZED, DispatchPackageStatus.DISPATCHED].includes(
          otherPkg.status,
        )
      ) {
        throw new ConflictException(
          `ALREADY PACKAGED: Coil ${prodUnit.coilNo} (${prodUnit.unitSerialNo}) is already assigned to Package ${otherPkg.packageNo} (${otherPkg.status})`,
        );
      }
    }

    // 6. Execute atomic insertion & totals recalculation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let addedUnit: DispatchPackageUnit;
    try {
      const unitRecord = queryRunner.manager.create(DispatchPackageUnit, {
        companyId,
        packageId: pkg.id,
        productionUnitId: prodUnit.id,
        unitSerialNo: prodUnit.unitSerialNo,
        coilNo: prodUnit.coilNo,
        itemId: prodUnit.itemId,
        itemName: prodUnit.item?.name || 'Finished Product',
        itemCode: prodUnit.item?.itemCode || null,
        weightKg: prodUnit.weightKg != null ? Number(prodUnit.weightKg) : null,
        lengthMeters: prodUnit.lengthMeters != null ? Number(prodUnit.lengthMeters) : null,
        batchNo: prodUnit.batchNo || null,
        status: DispatchPackageUnitStatus.PACKED,
        addedBy: userId || null,
      });

      addedUnit = await queryRunner.manager.save(unitRecord);

      // Recalculate authoritative totals
      const totalsResult = await queryRunner.manager.query(
        `SELECT 
          COUNT(*)::int as total_units,
          COALESCE(SUM(weight_kg), 0)::numeric as total_weight,
          COALESCE(SUM(length_meters), 0)::numeric as total_length
         FROM dispatch_package_units
         WHERE package_id = $1 AND status = 'PACKED'`,
        [pkg.id],
      );

      const totals = totalsResult[0] || { total_units: 0, total_weight: 0, total_length: 0 };

      await queryRunner.manager.update(DispatchPackage, pkg.id, {
        totalUnits: Number(totals.total_units),
        totalWeightKg: Number(totals.total_weight),
        totalLengthMeters: Number(totals.total_length),
        updatedBy: userId || null,
      });

      // Record audit inside transaction
      const auditLog = queryRunner.manager.create(DispatchPackageAuditLog, {
        companyId,
        packageId: pkg.id,
        action: DispatchPackageAction.UNIT_ADDED,
        productionUnitId: prodUnit.id,
        unitSerialNo: prodUnit.unitSerialNo,
        details: {
          coilNo: prodUnit.coilNo,
          weightKg: prodUnit.weightKg,
          lengthMeters: prodUnit.lengthMeters,
          item: prodUnit.item?.name,
        },
        performedBy: userId || null,
        performedByName: userName || null,
      });
      await queryRunner.manager.save(auditLog);

      await queryRunner.commitTransaction();
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      if (err?.code === '23505') {
        // Postgres unique violation on idx_unique_active_packed_unit
        throw new ConflictException(
          `CONCURRENCY CONFLICT: Coil ${prodUnit.coilNo} was just added by another terminal`,
        );
      }
      throw err;
    } finally {
      await queryRunner.release();
    }

    const updatedPackage = await this.findOne(pkg.id, companyId);
    return { package: updatedPackage, addedUnit };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 4. REMOVE UNIT BEFORE FINALIZATION
  // ════════════════════════════════════════════════════════════════════════════

  async removeUnit(
    packageId: string,
    unitId: string,
    dto?: RemoveUnitDto,
    companyId?: string,
    userId?: string,
    userName?: string,
  ): Promise<DispatchPackage> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, ...(companyId ? { companyId } : {}), isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Dispatch package ${packageId} not found`);
    }

    if (pkg.status !== DispatchPackageStatus.OPEN) {
      throw new BadRequestException(
        `Cannot remove unit: Package ${pkg.packageNo} is already ${pkg.status}`,
      );
    }

    const unitRow = await this.unitRepo.findOne({
      where: { id: unitId, packageId: pkg.id, status: DispatchPackageUnitStatus.PACKED },
    });

    if (!unitRow) {
      throw new NotFoundException(`Unit ${unitId} is not active in this package`);
    }

    unitRow.status = DispatchPackageUnitStatus.REMOVED;
    unitRow.removedAt = new Date();
    unitRow.removedBy = userId || null;
    unitRow.removalReason = dto?.reason || 'Removed by operator before finalization';
    await this.unitRepo.save(unitRow);

    // Recalculate totals
    await this.recalculatePackageTotals(pkg.id);

    await this.recordAudit(
      pkg.id,
      pkg.companyId,
      DispatchPackageAction.UNIT_REMOVED,
      unitRow.productionUnitId,
      unitRow.unitSerialNo,
      {
        coilNo: unitRow.coilNo,
        reason: unitRow.removalReason,
      },
      userId,
      userName,
    );

    return this.findOne(pkg.id, pkg.companyId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. FINALIZE PACKAGE (Locks Package & Computes Authoritative Totals)
  // ════════════════════════════════════════════════════════════════════════════

  async finalizePackage(
    packageId: string,
    dto?: FinalizePackageDto,
    companyId?: string,
    userId?: string,
    userName?: string,
  ): Promise<DispatchPackage> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, ...(companyId ? { companyId } : {}), isActive: true },
      relations: ['units'],
    });

    if (!pkg) {
      throw new NotFoundException(`Dispatch package ${packageId} not found`);
    }

    if (pkg.status !== DispatchPackageStatus.OPEN) {
      throw new BadRequestException(
        `Package ${pkg.packageNo} cannot be finalized because it is currently ${pkg.status}`,
      );
    }

    const activeUnits = (pkg.units || []).filter(
      (u) => u.status === DispatchPackageUnitStatus.PACKED,
    );

    if (activeUnits.length === 0) {
      throw new BadRequestException(
        'Cannot finalize an empty package. Scan at least one Production Unit.',
      );
    }

    // Authoritative totals from database
    const totalsResult = await this.unitRepo.query(
      `SELECT 
        COUNT(*)::int as total_units,
        COALESCE(SUM(weight_kg), 0)::numeric as total_weight,
        COALESCE(SUM(length_meters), 0)::numeric as total_length
       FROM dispatch_package_units
       WHERE package_id = $1 AND status = 'PACKED'`,
      [pkg.id],
    );

    const totals = totalsResult[0] || { total_units: 0, total_weight: 0, total_length: 0 };

    pkg.status = DispatchPackageStatus.FINALIZED;
    pkg.totalUnits = Number(totals.total_units);
    pkg.totalWeightKg = Number(totals.total_weight);
    pkg.totalLengthMeters = Number(totals.total_length);
    pkg.finalizedAt = new Date();
    pkg.finalizedBy = userId || null;
    pkg.finalizedByName = userName || null;
    if (dto?.remarks) {
      pkg.remarks = (pkg.remarks ? `${pkg.remarks}\n` : '') + dto.remarks;
    }

    const finalized = await this.packageRepo.save(pkg);

    await this.recordAudit(
      finalized.id,
      finalized.companyId,
      DispatchPackageAction.PACKAGE_FINALIZED,
      null,
      null,
      {
        totalUnits: finalized.totalUnits,
        totalWeightKg: finalized.totalWeightKg,
        totalLengthMeters: finalized.totalLengthMeters,
      },
      userId,
      userName,
    );

    return this.findOne(finalized.id, finalized.companyId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 6. LINK GATE PASS / DELIVERY NOTE
  // ════════════════════════════════════════════════════════════════════════════

  async linkGatePass(
    packageId: string,
    dto: LinkGatePassDto,
    companyId: string,
    userId?: string,
    userName?: string,
  ): Promise<DispatchPackage> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, companyId, isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Dispatch package ${packageId} not found`);
    }

    if (pkg.status === DispatchPackageStatus.CANCELLED) {
      throw new BadRequestException('Cannot link Gate Pass to a CANCELLED package');
    }

    pkg.gatePassNo = dto.gatePassNo.trim();
    if (dto.salesDeliveryId) pkg.salesDeliveryId = dto.salesDeliveryId;
    if (dto.vehicleNo) pkg.vehicleNo = dto.vehicleNo.trim();
    if (dto.driverName) pkg.driverName = dto.driverName.trim();
    if (dto.driverPhone) pkg.driverPhone = dto.driverPhone.trim();
    if (dto.remarks) {
      pkg.remarks = (pkg.remarks ? `${pkg.remarks}\n` : '') + dto.remarks;
    }

    const saved = await this.packageRepo.save(pkg);

    await this.recordAudit(
      saved.id,
      companyId,
      DispatchPackageAction.GATE_PASS_LINKED,
      null,
      null,
      {
        gatePassNo: pkg.gatePassNo,
        vehicleNo: pkg.vehicleNo,
        driverName: pkg.driverName,
      },
      userId,
      userName,
    );

    return this.findOne(saved.id, companyId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 7. RECORD PACKAGE PRINT
  // ════════════════════════════════════════════════════════════════════════════

  async recordPackagePrint(
    packageId: string,
    companyId: string,
    userId?: string,
    userName?: string,
  ): Promise<DispatchPackage> {
    const pkg = await this.findOne(packageId, companyId);

    await this.recordAudit(
      pkg.id,
      companyId,
      DispatchPackageAction.PACKAGE_PRINTED,
      null,
      null,
      {
        packageNo: pkg.packageNo,
        totalUnits: pkg.totalUnits,
        totalWeightKg: pkg.totalWeightKg,
      },
      userId,
      userName,
    );

    return pkg;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 8. GATE SCAN VERIFY & FINAL EXIT (Mobile Gate Workflow)
  // ════════════════════════════════════════════════════════════════════════════

  async gateVerify(
    packageQrOrNo: string,
    companyId: string,
  ): Promise<{
    package: DispatchPackage;
    canExit: boolean;
    verificationMessage: string;
  }> {
    const clean = (packageQrOrNo || '').trim();
    if (!clean) throw new BadRequestException('Package QR or number is required');

    const pkg = await this.packageRepo.findOne({
      where: [
        { packageQrPayload: clean, companyId, isActive: true },
        { packageNo: clean, companyId, isActive: true },
      ],
      relations: ['units', 'salesDelivery'],
    });

    if (!pkg) {
      throw new NotFoundException(`No package found for QR/number "${clean}"`);
    }

    // Active packed units
    pkg.units = (pkg.units || []).filter(
      (u) => u.status === DispatchPackageUnitStatus.PACKED,
    );

    let canExit = false;
    let verificationMessage = '';

    if (pkg.status === DispatchPackageStatus.OPEN) {
      canExit = false;
      verificationMessage = `Package ${pkg.packageNo} is OPEN (scanning in progress). It must be FINALIZED before gate exit.`;
    } else if (pkg.status === DispatchPackageStatus.CANCELLED) {
      canExit = false;
      verificationMessage = `Package ${pkg.packageNo} is CANCELLED and cannot exit.`;
    } else if (pkg.status === DispatchPackageStatus.DISPATCHED) {
      canExit = false;
      verificationMessage = `Package ${pkg.packageNo} has ALREADY EXITED the factory on ${pkg.gateExitedAt?.toISOString() || 'earlier date'}.`;
    } else if (pkg.status === DispatchPackageStatus.FINALIZED) {
      canExit = true;
      verificationMessage = `READY FOR EXIT: Package ${pkg.packageNo} is finalized with ${pkg.totalUnits} units (${Number(pkg.totalWeightKg).toFixed(2)} KG). Gate Pass: ${pkg.gatePassNo || 'Pending'}.`;
    }

    return { package: pkg, canExit, verificationMessage };
  }

  async gateExit(
    packageId: string,
    dto?: GateExitDto,
    companyId?: string,
    userId?: string,
    userName?: string,
  ): Promise<DispatchPackage> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, ...(companyId ? { companyId } : {}), isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Dispatch package ${packageId} not found`);
    }

    if (pkg.status === DispatchPackageStatus.DISPATCHED) {
      throw new BadRequestException(
        `Package ${pkg.packageNo} has already exited the factory`,
      );
    }

    if (pkg.status !== DispatchPackageStatus.FINALIZED) {
      throw new BadRequestException(
        `Cannot authorize gate exit: Package ${pkg.packageNo} is ${pkg.status}. Must be FINALIZED first.`,
      );
    }

    const exitTimestamp = new Date();

    pkg.status = DispatchPackageStatus.DISPATCHED;
    pkg.gateExitedAt = exitTimestamp;
    pkg.gateExitedBy = userId || null;
    pkg.gateExitedByName = userName || null;
    pkg.dispatchedAt = exitTimestamp;
    pkg.dispatchedBy = userId || null;
    pkg.dispatchedByName = userName || null;

    if (dto?.vehicleNo) pkg.vehicleNo = dto.vehicleNo.trim();
    if (dto?.driverName) pkg.driverName = dto.driverName.trim();
    if (dto?.remarks) {
      pkg.remarks = (pkg.remarks ? `${pkg.remarks}\n` : '') + dto.remarks;
    }

    const saved = await this.packageRepo.save(pkg);

    // If linked to SalesDelivery, update delivery status
    if (saved.salesDeliveryId) {
      await this.deliveryRepo
        .update(saved.salesDeliveryId, { status: 'DISPATCHED' })
        .catch(() => {});
    }

    await this.recordAudit(
      saved.id,
      saved.companyId,
      DispatchPackageAction.GATE_PASS_EXITED,
      null,
      null,
      {
        gatePassNo: saved.gatePassNo,
        vehicleNo: saved.vehicleNo,
        driverName: saved.driverName,
        gateName: dto?.gateName || 'Main Factory Gate',
      },
      userId,
      userName,
    );

    await this.recordAudit(
      saved.id,
      saved.companyId,
      DispatchPackageAction.PACKAGE_DISPATCHED,
      null,
      null,
      {
        totalUnits: saved.totalUnits,
        totalWeightKg: saved.totalWeightKg,
      },
      userId,
      userName,
    );

    return this.findOne(saved.id, saved.companyId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 9. CANCEL PACKAGE
  // ════════════════════════════════════════════════════════════════════════════

  async cancelPackage(
    packageId: string,
    dto: CancelPackageDto,
    companyId: string,
    userId?: string,
    userName?: string,
  ): Promise<DispatchPackage> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, companyId, isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException(`Dispatch package ${packageId} not found`);
    }

    if (pkg.status === DispatchPackageStatus.DISPATCHED) {
      throw new BadRequestException('Cannot cancel a package that has already DISPATCHED');
    }

    pkg.status = DispatchPackageStatus.CANCELLED;
    pkg.cancelledAt = new Date();
    pkg.cancelledBy = userId || null;
    pkg.cancellationReason = dto.reason.trim();

    // Release all packed units so they become available for dispatch again
    await this.unitRepo.update(
      { packageId: pkg.id, status: DispatchPackageUnitStatus.PACKED },
      {
        status: DispatchPackageUnitStatus.REMOVED,
        removedAt: new Date(),
        removedBy: userId || null,
        removalReason: `Package ${pkg.packageNo} was cancelled: ${dto.reason}`,
      },
    );

    const cancelled = await this.packageRepo.save(pkg);

    await this.recordAudit(
      cancelled.id,
      companyId,
      DispatchPackageAction.PACKAGE_CANCELLED,
      null,
      null,
      { reason: dto.reason },
      userId,
      userName,
    );

    return this.findOne(cancelled.id, companyId);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 10. TRACEABILITY CROSS-SEARCH
  // ════════════════════════════════════════════════════════════════════════════

  async traceLookup(
    query: string,
    companyId: string,
  ): Promise<{
    type: 'PRODUCTION_UNIT' | 'PACKAGE' | 'GATE_PASS' | 'NOT_FOUND';
    data: any;
  }> {
    const clean = (query || '').trim();
    if (!clean) throw new BadRequestException('Trace query is required');

    // 1. Check if query matches a Package No or Package QR
    const pkg = await this.packageRepo.findOne({
      where: [
        { packageNo: clean, companyId, isActive: true },
        { packageQrPayload: clean, companyId, isActive: true },
      ],
      relations: ['units', 'auditLogs', 'salesDelivery'],
    });

    if (pkg) {
      return { type: 'PACKAGE', data: pkg };
    }

    // 2. Check if query matches a Production Unit (Serial, Coil, QR, Barcode)
    const unitRow = await this.unitRepo.findOne({
      where: [
        { unitSerialNo: clean, companyId },
        { coilNo: clean, companyId },
      ],
      relations: ['package'],
    });

    if (unitRow) {
      const parentPackage = await this.findOne(unitRow.packageId, companyId);
      return {
        type: 'PRODUCTION_UNIT',
        data: {
          productionUnit: unitRow,
          dispatchPackage: parentPackage,
          unit: unitRow,
          package: parentPackage,
        },
      };
    }

    // 2b. Check if query matches an active Production Unit in Inventory (not yet packaged)
    const directProdUnit = await this.prodUnitRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.item', 'item')
      .where('u.companyId = :companyId', { companyId })
      .andWhere(
        '(u.qrPayload = :p OR u.barcodePayload = :p OR u.unitSerialNo = :p OR u.coilNo = :p)',
        { p: clean },
      )
      .andWhere('u.isActive = true')
      .getOne();

    if (directProdUnit) {
      return {
        type: 'PRODUCTION_UNIT',
        data: {
          productionUnit: directProdUnit,
          dispatchPackage: null,
          unit: directProdUnit,
          package: null,
        },
      };
    }

    // 3. Check if query matches a Gate Pass
    const gatePackages = await this.packageRepo.find({
      where: { gatePassNo: clean, companyId, isActive: true },
      relations: ['units'],
    });

    if (gatePackages.length > 0) {
      return { type: 'GATE_PASS', data: { gatePassNo: clean, packages: gatePackages } };
    }

    return { type: 'NOT_FOUND', data: null };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  private async generateNextPackageNo(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PKG-${year}`;

    const latest = await this.packageRepo
      .createQueryBuilder('p')
      .where('p.companyId = :companyId', { companyId })
      .andWhere('p.packageNo LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('p.packageNo', 'DESC')
      .getOne();

    let seq = 1;
    if (latest && latest.packageNo) {
      const suffix = latest.packageNo.replace(prefix, '');
      const parsed = parseInt(suffix, 10);
      if (!isNaN(parsed)) {
        seq = parsed + 1;
      }
    }

    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  private async recalculatePackageTotals(packageId: string): Promise<void> {
    const totalsResult = await this.unitRepo.query(
      `SELECT 
        COUNT(*)::int as total_units,
        COALESCE(SUM(weight_kg), 0)::numeric as total_weight,
        COALESCE(SUM(length_meters), 0)::numeric as total_length
       FROM dispatch_package_units
       WHERE package_id = $1 AND status = 'PACKED'`,
      [packageId],
    );

    const totals = totalsResult[0] || { total_units: 0, total_weight: 0, total_length: 0 };

    await this.packageRepo.update(packageId, {
      totalUnits: Number(totals.total_units),
      totalWeightKg: Number(totals.total_weight),
      totalLengthMeters: Number(totals.total_length),
    });
  }

  private async recordAudit(
    packageId: string,
    companyId: string,
    action: DispatchPackageAction,
    productionUnitId: string | null,
    unitSerialNo: string | null,
    details: Record<string, any> | null,
    performedBy?: string,
    performedByName?: string,
  ): Promise<void> {
    try {
      const log = this.auditRepo.create({
        packageId,
        companyId,
        action,
        productionUnitId,
        unitSerialNo,
        details,
        performedBy: performedBy || null,
        performedByName: performedByName || null,
      });
      await this.auditRepo.save(log);
    } catch (e) {
      console.error('Failed to save dispatch package audit log:', e);
    }
  }
}
