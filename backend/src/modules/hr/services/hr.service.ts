import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { HrDesignation } from '../entities/hr-designation.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { HrEmployeeSkill } from '../entities/hr-employee-skill.entity';
import { HrEmployeeTraining } from '../entities/hr-employee-training.entity';
import { HrEmployeeDocument } from '../entities/hr-employee-document.entity';
import { HrEmployeeHistory } from '../entities/hr-employee-history.entity';
import {
  CreateHrDesignationDto, CreateHrEmployeeDto, CreateHrAttendanceDto,
  CreateHrLeaveRequestDto, CreateHrLeaveTypeDto, CreateHrShiftDto, CreateHrHolidayDto,
} from '../dto/hr.dto';
import { HrLeaveType } from '../entities/hr-leave-type.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { HrHoliday } from '../entities/hr-holiday.entity';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(HrDesignation) private readonly designationRepo: Repository<HrDesignation>,
    @InjectRepository(HrEmployee) private readonly employeeRepo: Repository<HrEmployee>,
    @InjectRepository(HrAttendance) private readonly attendanceRepo: Repository<HrAttendance>,
    @InjectRepository(HrLeaveRequest) private readonly leaveRepo: Repository<HrLeaveRequest>,
    @InjectRepository(HrLeaveType) private readonly leaveTypeRepo: Repository<HrLeaveType>,
    @InjectRepository(HrShift) private readonly shiftRepo: Repository<HrShift>,
    @InjectRepository(HrHoliday) private readonly holidayRepo: Repository<HrHoliday>,
    @InjectRepository(HrEmployeeSkill) private readonly skillRepo: Repository<HrEmployeeSkill>,
    @InjectRepository(HrEmployeeTraining) private readonly trainingRepo: Repository<HrEmployeeTraining>,
    @InjectRepository(HrEmployeeDocument) private readonly docRepo: Repository<HrEmployeeDocument>,
    @InjectRepository(HrEmployeeHistory) private readonly historyRepo: Repository<HrEmployeeHistory>,
  ) {}

  // ---- Designations ----
  async listDesignations(companyId: string) {
    return this.designationRepo.find({ where: { companyId }, order: { designationCode: 'ASC' } });
  }

  async createDesignation(dto: CreateHrDesignationDto) {
    const exists = await this.designationRepo.findOne({ where: { companyId: dto.companyId, designationCode: dto.designationCode } });
    if (exists) throw new BadRequestException('Designation code already exists');
    return this.designationRepo.save(this.designationRepo.create(dto));
  }

  // ---- Employees ----
  async listEmployees(companyId: string, query: { page?: number; limit?: number; search?: string; status?: string; departmentId?: string; designationId?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.employeeRepo.createQueryBuilder('e')
      .where('e.company_id = :companyId', { companyId });
    if (query.search) qb.andWhere('(e.first_name ILIKE :s OR e.last_name ILIKE :s OR e.employee_code ILIKE :s OR e.email ILIKE :s)', { s: `%${query.search}%` });
    if (query.status) qb.andWhere('e.status = :st', { st: query.status });
    if (query.departmentId) qb.andWhere('e.department_id = :dept', { dept: query.departmentId });
    if (query.designationId) qb.andWhere('e.designation_id = :des', { des: query.designationId });
    qb.orderBy('e.employee_code', 'ASC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    // load designation names in a second pass to avoid join+pagination metadata issues
    const ids = data.map((e) => e.id);
    const withDesignations = ids.length
      ? await this.employeeRepo.find({ where: { id: In(ids) }, relations: ['designation'] })
      : [];
    const dMap = new Map(withDesignations.map((e) => [e.id, e.designation]));
    data.forEach((e) => { (e as any).designation = dMap.get(e.id) ?? null; });
    return { data, total, page, limit };
  }

  async findEmployee(id: string) {
    const emp = await this.employeeRepo.findOne({
      where: { id },
      relations: ['designation', 'manager', 'skills', 'training', 'documents', 'histories'],
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async createEmployee(dto: CreateHrEmployeeDto) {
    const exists = await this.employeeRepo.findOne({ where: { companyId: dto.companyId, employeeCode: dto.employeeCode } });
    if (exists) throw new BadRequestException('Employee code already exists');
    const emp = this.employeeRepo.create({
      ...dto, dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      joinDate: dto.joinDate ? new Date(dto.joinDate) : null,
    });
    return this.employeeRepo.save(emp);
  }

  async updateEmployee(id: string, dto: Partial<CreateHrEmployeeDto> & { status?: string }) {
    const emp = await this.employeeRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    const changes: { fromValue?: string; toValue?: string }[] = [];
    if (dto.status && dto.status !== emp.status) changes.push({ fromValue: emp.status, toValue: dto.status });
    if (dto.designationId && dto.designationId !== emp.designationId) changes.push({ fromValue: emp.designationId ?? undefined, toValue: dto.designationId });
    Object.assign(emp, dto);
    if (dto.dateOfBirth) emp.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.joinDate) emp.joinDate = new Date(dto.joinDate);
    const saved = await this.employeeRepo.save(emp);
    for (const c of changes) {
      await this.historyRepo.save(this.historyRepo.create({
        employeeId: id, changeType: 'STATUS_CHANGE', fromValue: c.fromValue ?? null, toValue: c.toValue ?? null,
        changeDate: new Date(), remarks: 'Updated via employee edit',
      }));
    }
    return saved;
  }

  // ---- Attendance ----
  async listAttendance(companyId: string, query: { page?: number; limit?: number; employeeId?: string; from?: string; to?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.attendanceRepo.createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId });
    if (query.employeeId) qb.andWhere('a.employee_id = :eid', { eid: query.employeeId });
    if (query.from) qb.andWhere('a.attendance_date >= :from', { from: query.from });
    if (query.to) qb.andWhere('a.attendance_date <= :to', { to: query.to });
    qb.orderBy('a.attendance_date', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    // load employee names in a second pass
    const ids = data.map((a) => a.employeeId);
    const employees = ids.length ? await this.employeeRepo.find({ where: { id: In(ids) } }) : [];
    const eMap = new Map(employees.map((e) => [e.id, e]));
    data.forEach((a) => { (a as any).employee = eMap.get(a.employeeId) ?? null; });
    return { data, total, page, limit };
  }

  async recordAttendance(dto: CreateHrAttendanceDto) {
    const exists = await this.attendanceRepo.findOne({ where: { employeeId: dto.employeeId, attendanceDate: new Date(dto.attendanceDate) as any } });
    if (exists) throw new BadRequestException('Attendance already recorded for this date');
    const rec = this.attendanceRepo.create({
      ...dto, attendanceDate: new Date(dto.attendanceDate) as any,
      checkIn: dto.checkIn ? new Date(dto.checkIn) : null, checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
    });
    return this.attendanceRepo.save(rec);
  }

  // ---- Leave ----
  async listLeaveTypes(companyId: string) {
    return this.leaveTypeRepo.find({ where: { companyId }, order: { leaveCode: 'ASC' } });
  }

  async createLeaveType(dto: CreateHrLeaveTypeDto) {
    const exists = await this.leaveTypeRepo.findOne({ where: { companyId: dto.companyId, leaveCode: dto.leaveCode } });
    if (exists) throw new BadRequestException('Leave type already exists');
    return this.leaveTypeRepo.save(this.leaveTypeRepo.create(dto));
  }

  async listLeaveRequests(companyId: string, query: { page?: number; limit?: number; employeeId?: string; status?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.leaveRepo.createQueryBuilder('l')
      .leftJoinAndSelect('l.employee', 'e')
      .where('l.company_id = :companyId', { companyId });
    if (query.employeeId) qb.andWhere('l.employee_id = :eid', { eid: query.employeeId });
    if (query.status) qb.andWhere('l.status = :st', { st: query.status });
    qb.orderBy('l.created_at', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async createLeaveRequest(dto: CreateHrLeaveRequestDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('End date before start date');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return this.leaveRepo.save(this.leaveRepo.create({
      ...dto, startDate: start as any, endDate: end as any, days, status: 'PENDING',
    }));
  }

  async approveLeave(id: string, approvedBy?: string) {
    const rec = await this.leaveRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException('Leave request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending requests can be approved');
    rec.status = 'APPROVED';
    rec.approvedBy = approvedBy ?? null;
    rec.approvedAt = new Date();
    return this.leaveRepo.save(rec);
  }

  // ---- Shifts ----
  async listShifts(companyId: string) {
    return this.shiftRepo.find({ where: { companyId }, order: { shiftCode: 'ASC' } });
  }

  async createShift(dto: CreateHrShiftDto) {
    const exists = await this.shiftRepo.findOne({ where: { companyId: dto.companyId, shiftCode: dto.shiftCode } });
    if (exists) throw new BadRequestException('Shift already exists');
    return this.shiftRepo.save(this.shiftRepo.create(dto));
  }

  // ---- Holidays ----
  async listHolidays(companyId: string) {
    return this.holidayRepo.find({ where: { companyId }, order: { holidayDate: 'ASC' } });
  }

  async createHoliday(dto: CreateHrHolidayDto) {
    return this.holidayRepo.save(this.holidayRepo.create({ ...dto, holidayDate: new Date(dto.holidayDate) as any }));
  }

  // ---- Employee sub-records ----
  async addSkill(employeeId: string, dto: { skillName: string; skillLevel?: string; yearsExperience?: number }) {
    return this.skillRepo.save(this.skillRepo.create({ employeeId, ...dto }));
  }

  async addTraining(employeeId: string, dto: { trainingName: string; provider?: string; trainingDate?: string }) {
    return this.trainingRepo.save(this.trainingRepo.create({ employeeId, ...dto, trainingDate: dto.trainingDate ? new Date(dto.trainingDate) : null }));
  }

  async addDocument(employeeId: string, dto: { documentName?: string; documentType?: string; fileUrl?: string }) {
    return this.docRepo.save(this.docRepo.create({ employeeId, ...dto }));
  }

  async listHistories(employeeId: string) {
    return this.historyRepo.find({ where: { employeeId }, order: { changeDate: 'DESC' } });
  }
}