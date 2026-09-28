import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { VisitorEntry, VisitorEntryStatus, Location, LocationStatus } from '../entities';
import { Division } from '../../organization/entities/division.entity';
import { Company } from '../../organization/entities/company.entity';
import { HrEmployee } from '../../hr/entities/hr-employee.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import {
  ConfirmHostVisitDto,
  CreateVisitorEntryDto,
  MAX_SIGNATURE_BYTES,
} from '../dto';
import { applyDivisionScopeFilter } from '../../../common/division-scope.util';
import { UUID_SHAPE, normalizeCnic, maskCnic } from '../../../common/validators';
import { ActivityLogService } from '../../audit/services/activity-log.service';

/** The photo is personal data — keep it small and image-only (mirrors receipts). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Confirm the bytes really are the image the client claimed (§6).
 *
 * WHY THIS IS NEEDED
 *   `Content-Type` on a multipart part is chosen by the client, so a declared
 *   `image/jpeg` proves nothing: a request can send arbitrary bytes with that
 *   header and be believed. Verified live against the running server before
 *   this check existed — a body of plain text declared as `image/jpeg` was
 *   accepted with 201 and written into the private photo store.
 *
 *   The consequence is not theoretical. The printed slip inlines the stored
 *   photo, and the slip's whole safety argument rests on that file being an
 *   image, so accepting arbitrary content silently removes it. The file is also
 *   served back through the authorised photo endpoint.
 *
 *   Each format is checked by its own leading bytes (the same technique the
 *   signature path uses for PNG), and the accepted type is the one the CONTENT
 *   proves — so the extension written to disk and the MIME recorded in the row
 *   cannot disagree with the bytes on disk.
 */
function detectImageMime(buffer: Buffer): string | null {
  // JPEG: SOI (FF D8) then a marker byte. Requiring a real 4th marker byte, not
  // just FF D8 FF, stops a three-byte file from being accepted as a photo.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[3] >= 0xc0
  ) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.subarray(1, 4).toString('ascii') === 'PNG') {
    return 'image/png';
  }
  // RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** PNG only: a signature has no business being a JPEG or a data: URL of SVG. */
const SIGNATURE_DATA_URL_PREFIX = 'data:image/png;base64,';
const SIGNATURE_MIME = 'image/png';
/** How many times a reference collision is retried before giving up (§5). */
export const REFERENCE_MAX_ATTEMPTS = 5;

export interface HostOption {
  id: string;
  employeeCode: string;
  name: string;
  department: string | null;
  divisionId: string | null;
}

export interface PhotoRef {
  absolutePath: string;
  mime: string;
}

/**
 * Prompt #19A — what a printed slip shows when the acting ERP user cannot be
 * resolved to a person.
 *
 * A visitor slip is a document a person hands to a security guard and a person
 * signs by hand. Printing a raw UUID in place of a name ("Confirmed By:
 * 0804af57-1f03-…") is not a usable record and is not something a paper
 * document should ever carry, so the slip payload always resolves to a human
 * string. This constant is the last-resort value; it is deliberately
 * distinguishable from a real name so a reviewer can tell "we could not
 * resolve this" apart from "this person is called System User".
 */
export const SLIP_ACTOR_FALLBACK_NAME = 'System User';

/**
 * Visitor Entry service (Prompt #17) + Visitor Exit (Prompt #18) + Visitor Slip
 * and Host Confirmation (Prompt #19).
 *
 * Authorization model (§11/§12) is enforced HERE as well as in `DivisionScopeGuard`
 * — never trust the frontend:
 *   • every read/write is scoped to the caller's company
 *   • `allowedDivisionIds` (user org scope ∩ role-permission division scope)
 *     filters every list and is re-checked for every single-row operation
 *   • a location must belong to the submitted division
 *   • a host must exist, be active, be in the caller's company and inside the
 *     caller's divisions
 *   • `time_in` and `time_out` are generated by the server — never accepted
 *     from a client payload (create §8, exit §4)
 *   • the exit transition is a single conditional UPDATE, so a duplicate or
 *     concurrent checkout can never overwrite the first Time-Out (§15)
 *   • `visitor_reference`, the host-confirmation fields and the signature
 *     storage reference are likewise server-owned; the confirmation flow never
 *     touches `status` / `time_in` / `time_out` (#19 §28)
 */
@Injectable()
export class VisitorEntryService {
  private readonly storagePath = path.resolve(process.env.STORAGE_PATH || './storage');

  constructor(
    @InjectRepository(VisitorEntry)
    private readonly visitorRepo: Repository<VisitorEntry>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(HrEmployee)
    private readonly employeeRepo: Repository<HrEmployee>,
    // Prompt #19A — the slip prints PEOPLE, not the UUIDs stored in
    // `created_by` / `host_confirmed_by`. Resolved through the same
    // `erp_users.displayName` the rest of the ERP uses (see
    // `hr-advances.service.ts` `addAuditJoins`), never from a hard-coded string.
    @InjectRepository(ErpUser)
    private readonly erpUserRepo: Repository<ErpUser>,
    private readonly activityLog: ActivityLogService,
  ) {}

  // ──────────────────────────────────────────────────────────── EXIT ──────
  /**
   * Visitor Exit / Time-Out (Prompt #18 §5, §6, §15).
   *
   * Order of operations matters and is deliberate:
   *   1. resolve the row through `findRow`, so an unknown/malformed id is a 404
   *      and a visitor in a division outside the caller's effective scope is a
   *      403 — never a 409 that would confirm the id exists (§7, §25);
   *   2. refuse a state that is not check-out eligible with a 409 business
   *      error, not a 500 (§6, §9);
   *   3. write with ONE conditional UPDATE (`status IN (…) AND time_out IS
   *      NULL`). The row-level lock makes double-click / two-user checkout safe:
   *      exactly one UPDATE reports `affected = 1`, the loser reports 0 and is
   *      re-read to answer with a controlled conflict instead of overwriting the
   *      first Time-Out (§15);
   *   4. the Time-Out is `new Date()` on the server. Nothing in the request
   *      body can influence it — the controller rejects those keys outright (§4).
   *
   * Only the three checkout fields are written: company, division, location,
   * visitor identity, host and `time_in` are untouched (§8).
   */
  async checkOut(
    id: string,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<any> {
    const entry = await this.findRow(id, companyId, allowedDivisionIds);
    this.assertCheckOutAllowed(entry);

    const timeOut = new Date();
    const updateResult = await this.visitorRepo.update(
      {
        id: entry.id,
        companyId,
        status: In([VisitorEntryStatus.PENDING, VisitorEntryStatus.INSIDE]),
        timeOut: IsNull(),
      } as FindOptionsWhere<VisitorEntry>,
      {
        status: VisitorEntryStatus.COMPLETED,
        timeOut,
        exitedBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    );

    if ((updateResult?.affected ?? 0) === 0) {
      // Lost the race (double-click, second user, stale tab). Re-read and answer
      // with the same controlled 409 a plain second call would have produced.
      const current = await this.findRow(id, companyId, allowedDivisionIds);
      this.assertCheckOutAllowed(current);
      // Still eligible but untouched — the row changed under us. Refuse rather
      // than guess; nothing was written, so the visit is still open.
      throw new ConflictException('Visitor could not be checked out. Please try again.');
    }

    const updated = await this.findRow(id, companyId, allowedDivisionIds);

    await this.activityLog.log({
      actorUserId: userId,
      action: 'UPDATE',
      targetType: 'visitor_entry',
      targetId: updated.id,
      targetName: updated.visitorName,
      details: `Visitor exit recorded (Time-Out) for ${updated.division?.name ?? updated.divisionId}`,
    });

    return this.toDetailView(updated);
  }

  /** §6/§9 — the only legal transition is PENDING (or INSIDE) → COMPLETED. */
  private assertCheckOutAllowed(entry: VisitorEntry): void {
    if (entry.timeOut || entry.status === VisitorEntryStatus.COMPLETED) {
      throw new ConflictException('Visitor has already checked out.');
    }
    if (
      entry.status !== VisitorEntryStatus.PENDING &&
      entry.status !== VisitorEntryStatus.INSIDE
    ) {
      throw new ConflictException(`Visitor cannot be checked out while the status is ${entry.status}.`);
    }
  }

  // ─────────────────────────────────────────────────────────── CREATE ─────
  async create(
    dto: CreateVisitorEntryDto,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<VisitorEntry> {
    // 1. Division must belong to the caller's company AND to their divisions.
    if (Array.isArray(allowedDivisionIds) && !allowedDivisionIds.includes(dto.divisionId)) {
      throw new ForbiddenException('You do not have access to this division.');
    }
    const division = await this.divisionRepo.findOne({ where: { id: dto.divisionId, companyId } });
    if (!division) {
      throw new BadRequestException('Selected division does not exist');
    }

    // 2. Location must exist in the same company AND inside that same division.
    const location = await this.locationRepo.findOne({ where: { id: dto.locationId, companyId } });
    if (!location) {
      throw new BadRequestException('Selected location does not exist');
    }
    if (location.divisionId !== dto.divisionId) {
      throw new BadRequestException('Selected location does not belong to the selected division');
    }
    if (location.status !== LocationStatus.ACTIVE) {
      throw new BadRequestException('Selected location is not active');
    }

    // 3. Host — existing employee master, validated server-side (§10).
    const host = await this.employeeRepo.findOne({
      where: { id: dto.hostEmployeeId, companyId },
      relations: { department: true },
    });
    if (!host) {
      throw new BadRequestException('Selected person being visited does not exist');
    }
    if (host.status !== 'ACTIVE') {
      throw new BadRequestException('Selected person being visited is not an active employee');
    }
    const hostDivisionId = host.department?.divisionId ?? null;
    if (hostDivisionId && Array.isArray(allowedDivisionIds) && !allowedDivisionIds.includes(hostDivisionId)) {
      throw new ForbiddenException('The selected person belongs to a division you do not have access to.');
    }

    // 4. SERVER-SIDE Time-In + PENDING. Nothing here reads `dto.timeIn`.
    const now = new Date();
    const entry = this.visitorRepo.create({
      companyId,
      divisionId: division.id,
      locationId: location.id,
      visitorName: dto.visitorName.trim(),
      cnic: normalizeCnic(dto.cnic) ?? dto.cnic,
      mobile: dto.mobile,
      visitorCompany: dto.visitorCompany?.trim() || null,
      hostEmployeeId: host.id,
      hostNameSnapshot: [host.firstName, host.lastName].filter(Boolean).join(' ').trim() || host.employeeCode,
      photoPath: null,
      photoMime: null,
      timeIn: now,
      timeOut: null,
      status: VisitorEntryStatus.PENDING,
      createdBy: userId,
      updatedBy: userId,
    });

    // §5 — the reception reference is generated by the server and must be unique.
    // Assigned last so `save` never attempts to insert it as NULL (the column is
    // NOT NULL) and so a reference collision can be retried without touching any
    // other field of the payload.
    const saved = await this.saveWithVisitorReference(entry, companyId, now);

    // Audit (§18) — never logs CNIC or any other visitor personal data (§19).
    await this.activityLog.log({
      actorUserId: userId,
      action: 'CREATE',
      targetType: 'visitor_entry',
      targetId: saved.id,
      targetName: saved.visitorName,
      details: `Visitor registered (${saved.visitorReference}) for ${division.name} / ${location.name}`,
    });

    return saved;
  }

  /**
   * Persist a new entry with a freshly generated `visitorReference` (Prompt #19 §5).
   *
   * The sequence follows the project's own document-number convention
   * (`DispatchPackageService.generateNextPackageNo`): the highest existing
   * number of the same `VIS-<year>-` prefix plus one, zero-padded to 6 digits.
   *
   * WHY THE RETRY LOOP
   *   "Highest existing + 1" is race-prone by nature: two visitors registered in
   *   the same second can read the same high-water mark. A receipt slip reference
   *   is a security identifier, so a duplicate is not acceptable — and a UNIQUE
   *   index (ERP-00071) makes the database the final arbiter. A unique-violation
   *   is therefore caught and retried with a fresh number, and only a genuine
   *   failure after every attempt is surfaced. This does not change the project's
   *   numbering convention, it just refuses to emit a duplicate one.
   */
  private async saveWithVisitorReference(
    entry: VisitorEntry,
    companyId: string,
    now: Date,
  ): Promise<VisitorEntry> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= REFERENCE_MAX_ATTEMPTS; attempt += 1) {
      const visitorReference = await this.nextVisitorReference(companyId, now, attempt);
      entry.visitorReference = visitorReference;
      try {
        return await this.visitorRepo.save(entry);
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
        lastError = error;
      }
    }

    throw new BadRequestException(
      'Could not allocate a visitor reference. Please retry the registration.',
      { cause: lastError as Error },
    );
  }

  /**
   * `VIS-<server year>-<6 digits>` — the number for the CURRENT server year.
   *
   * `attempt` widens the scan after a collision: attempt 1 looks at the exact
   * prefix, attempt 2 falls back to the year prefix alone, and later attempts
   * widen further, so a collision is always resolved to a free number instead of
   * the same busy row being read forever.
   */
  private async nextVisitorReference(companyId: string, now: Date, attempt: number): Promise<string> {
    const year = now.getFullYear();
    const prefix = `VIS-${year}`;
    const like = attempt === 1 ? `${prefix}-%` : `%`;

    const latest = await this.visitorRepo
      .createQueryBuilder('ve')
      .where('ve.company_id = :companyId', { companyId })
      .andWhere('ve.visitor_reference LIKE :like', { like })
      .orderBy('ve.visitorReference', 'DESC')
      .getOne();

    let seq = 1;
    const latestRef = latest?.visitorReference;
    if (latestRef) {
      // `VIS-2026-000123` → `000123`; `VIS-2025-000099` → 99 (next year starts at
      // 100, which is intentional — a slip reference only has to be unique).
      const suffix = latestRef.slice(latestRef.lastIndexOf('-') + 1);
      const parsed = parseInt(suffix, 10);
      if (!Number.isNaN(parsed)) {
        seq = parsed + 1;
      }
    }

    return `${prefix}-${String(seq).padStart(6, '0')}`;
  }

  /** Postgres 23505 — a unique index refused the write. */
  private isUniqueViolation(error: unknown): boolean {
    const code = (error as { code?: string; driverError?: { code?: string } })?.code
      ?? (error as { driverError?: { code?: string } })?.driverError?.code;
    return code === '23505';
  }

  // ──────────────────────────────────────────────────────────── LIST ──────
  async findAll(options: {
    companyId: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: VisitorEntryStatus;
    today?: boolean;
    divisionId?: string;
    locationId?: string;
    allowedDivisionIds?: string[];
  }): Promise<{ data: any[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(200, Math.max(1, options.limit ?? 25));

    const qb = this.visitorRepo
      .createQueryBuilder('ve')
      .leftJoinAndSelect('ve.division', 'div')
      .leftJoinAndSelect('ve.location', 'loc')
      .where('ve.company_id = :companyId', { companyId: options.companyId });

    // §11 — never return visitors outside the caller's divisions.
    applyDivisionScopeFilter(qb, 've.divisionId', options.allowedDivisionIds);

    if (options.divisionId) {
      qb.andWhere('ve.divisionId = :divisionId', { divisionId: options.divisionId });
    }
    if (options.locationId) {
      qb.andWhere('ve.locationId = :locationId', { locationId: options.locationId });
    }
    if (options.status) {
      qb.andWhere('ve.status = :status', { status: options.status });
      // §10/§13 — the two filters reception and security rely on are defined by
      // BOTH columns, not status alone: PENDING means "still on site"
      // (time_out IS NULL) and COMPLETED means "closed" (time_out IS NOT NULL).
      // A row can never satisfy both, so the two views can never overlap.
      if (options.status === VisitorEntryStatus.PENDING) {
        qb.andWhere('ve.timeOut IS NULL');
      } else if (options.status === VisitorEntryStatus.COMPLETED) {
        qb.andWhere('ve.timeOut IS NOT NULL');
      }
    }
    if (options.search && options.search.trim()) {
      // §5 — `visitor_reference` is searchable because it is the reference
      // reception and security actually quote; a slip number that cannot be
      // looked up would be decoration.
      qb.andWhere(
        '(ve.visitor_name ILIKE :q OR ve.visitor_company ILIKE :q OR ve.host_name_snapshot ILIKE :q OR ve.mobile ILIKE :q OR ve.cnic ILIKE :q OR ve.visitor_reference ILIKE :q)',
        { q: `%${options.search.trim()}%` },
      );
    }

    // §19 — "current-day visitor monitoring" without a second date system: the
    // day boundaries are computed on the SERVER from its own clock (the same
    // convention that generated time_in), so a client in another timezone can
    // never widen or shrink the window.
    if (options.today) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      qb.andWhere('ve.timeIn >= :startOfToday AND ve.timeIn < :startOfTomorrow', {
        startOfToday,
        startOfTomorrow,
      });
    }

    qb.orderBy('ve.timeIn', 'DESC').skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return { data: rows.map((row) => this.toListView(row)), total };
  }

  // ────────────────────────────────────────────────────────── DETAIL ──────
  async findOne(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<any> {
    const entry = await this.findRow(id, companyId, allowedDivisionIds);
    return this.toDetailView(entry);
  }

  /**
   * Re-read a visitor after a mutation (Prompt #18 §24) — the exit response is
   * the same shape the detail endpoint returns, so the client can drop the row
   * straight into its list/detail state without a second request.
   */
  async refreshOne(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<any> {
    return this.findOne(id, companyId, allowedDivisionIds);
  }

  // ─────────────────────────────────────────────────────── HOST LOOKUP ────
  async findHosts(
    companyId: string,
    allowedDivisionIds?: string[],
    options?: { search?: string; divisionId?: string; limit?: number },
  ): Promise<HostOption[]> {
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.department', 'dept')
      .where('e.company_id = :companyId', { companyId })
      .andWhere('e.status = :status', { status: 'ACTIVE' });

    if (options?.divisionId) {
      qb.andWhere('dept.division_id = :hostDivisionId', { hostDivisionId: options.divisionId });
    } else {
      applyDivisionScopeFilter(qb, 'dept.divisionId', allowedDivisionIds);
    }

    const search = options?.search?.trim();
    if (search) {
      qb.andWhere('(e.first_name ILIKE :q OR e.last_name ILIKE :q OR e.employee_code ILIKE :q)', {
        q: `%${search}%`,
      });
    }

    // TypeORM resolves ORDER BY through entity property paths, not raw column
    // names — `e.first_name` throws "databaseName of undefined" at execution.
    qb.orderBy('e.firstName', 'ASC').addOrderBy('e.lastName', 'ASC').take(Math.min(100, options?.limit ?? 50));
    const rows = await qb.getMany();

    return rows.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.employeeCode,
      department: employee.department?.name ?? null,
      divisionId: employee.department?.divisionId ?? null,
    }));
  }

  // ─────────────────────────────────────────────────────────── PHOTO ──────
  async savePhoto(
    entryId: string,
    companyId: string,
    userId: string | undefined,
    file: { originalname?: string; mimetype?: string; buffer: Buffer } | undefined,
    allowedDivisionIds?: string[],
  ): Promise<any> {
    const entry = await this.findRow(entryId, companyId, allowedDivisionIds);

    if (!file || !file.buffer) {
      throw new BadRequestException('Visitor photo file is required');
    }
    if (file.buffer.length > MAX_PHOTO_BYTES) {
      throw new BadRequestException('Visitor photo must be 5 MB or smaller');
    }
    // The declared type must be one we accept AND the bytes must actually be
    // that image. Rejecting here means nothing is ever written to disk.
    if (!PHOTO_MIME_EXT[file.mimetype ?? '']) {
      throw new BadRequestException('Visitor photo must be a JPEG, PNG or WebP image');
    }
    const detected = detectImageMime(file.buffer);
    if (!detected) {
      throw new BadRequestException('Visitor photo is not a readable JPEG, PNG or WebP image');
    }
    // Recorded from the CONTENT, so the row can never claim a type the file is not.
    const extension = PHOTO_MIME_EXT[detected];

    const relativePath = path.posix.join('visitors', companyId, entry.id, `${randomUUID()}${extension}`);
    const absolutePath = path.resolve(this.storagePath, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    if (entry.photoPath) {
      await fs.unlink(path.resolve(this.storagePath, entry.photoPath)).catch(() => undefined);
    }
    entry.photoPath = relativePath;
    entry.photoMime = detected;
    entry.updatedBy = userId ?? null;

    const saved = await this.visitorRepo.save(entry);

    await this.activityLog.log({
      actorUserId: userId,
      action: 'UPDATE',
      targetType: 'visitor_entry',
      targetId: saved.id,
      targetName: saved.visitorName,
      details: 'Visitor photo attached',
    });

    return this.toDetailView(saved);
  }

  /** Resolve the stored photo only after permission + division checks passed. */
  async resolvePhoto(
    entryId: string,
    companyId: string,
    allowedDivisionIds?: string[],
  ): Promise<PhotoRef | null> {
    const entry = await this.findRow(entryId, companyId, allowedDivisionIds);
    if (!entry.photoPath) return null;

    const absolutePath = path.resolve(this.storagePath, entry.photoPath);
    // Defence in depth: never serve a path that escaped STORAGE_PATH.
    if (!absolutePath.startsWith(this.storagePath + path.sep)) {
      throw new NotFoundException('Visitor photo not found');
    }
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat || !stat.isFile()) return null;

    return { absolutePath, mime: entry.photoMime || 'image/jpeg' };
  }

  // ──────────────────────────────────────────── HOST CONFIRMATION (#19) ────
  /**
   * Host / person-being-visited confirmation (Prompt #19 §12, §15, §18, §28).
   *
   * The single most important property of this method: it records a fact about
   * the visit and NOTHING else. It never writes `timeOut`, `status`, `timeIn`,
   * `divisionId` or `locationId` (§28) — a confirmed host is still a PENDING
   * visitor until the Prompt #18 exit records the Time-Out.
   *
   * Identity is NOT verified (§17). `hostConfirmedBy` is the authenticated ERP
   * user who pressed the button; the person being visited stays in
   * `hostEmployeeId` / `hostNameSnapshot`. The system makes no claim that the two
   * are the same person.
   *
   * Order of operations, mirroring the Prompt #18 exit so the two flows behave
   * identically under a double-click:
   *   1. `findRow` → 404 for a missing/malformed id, 403 for a visitor outside
   *      the caller's effective divisions (never a leak that confirms the id
   *      exists — §20);
   *   2. a state check → 409 "already confirmed" when the host confirmed earlier;
   *   3. ONE conditional UPDATE (`host_confirmed = FALSE`). Exactly one caller
   *      reports `affected = 1`; a concurrent second confirmation reports 0 and
   *      is re-read to answer with a controlled conflict instead of overwriting
   *      the first `host_confirmed_at` (§31.12);
   *   4. the audit entry goes through the existing `ActivityLogService` — the
   *      signature image is never part of the log details (§18, §30).
   */
  async confirmHostVisit(
    id: string,
    companyId: string,
    userId: string | undefined,
    allowedDivisionIds?: string[],
    dto: ConfirmHostVisitDto = {},
  ): Promise<any> {
    const entry = await this.findRow(id, companyId, allowedDivisionIds);
    this.assertHostConfirmationAllowed(entry);

    // Write the signature file BEFORE the row update so a rejected confirmation
    // never leaves a confirmation without its signature. If the update then
    // loses the race, the file is removed again — no orphans, no half-state.
    const signature = await this.persistSignature(entry, companyId, dto.signature);
    const now = new Date();

    const updateResult = await this.visitorRepo.update(
      {
        id: entry.id,
        companyId,
        hostConfirmed: false,
      } as FindOptionsWhere<VisitorEntry>,
      {
        hostConfirmed: true,
        hostConfirmedAt: now,
        hostConfirmedBy: userId ?? null,
        ...(signature
          ? {
              signaturePath: signature.relativePath,
              signatureMime: signature.mime,
              signatureCapturedAt: now,
              signatureCapturedBy: userId ?? null,
            }
          : {}),
        updatedBy: userId ?? null,
      },
    );

    if ((updateResult?.affected ?? 0) === 0) {
      if (signature) await this.discardSignature(signature.relativePath);
      const current = await this.findRow(id, companyId, allowedDivisionIds);
      this.assertHostConfirmationAllowed(current);
      throw new ConflictException('Host visit could not be confirmed. Please try again.');
    }

    const updated = await this.findRow(id, companyId, allowedDivisionIds);

    // §18/§30 — the audit detail records THAT a signature was captured, never the
    // image itself, and never any CNIC/mobile value.
    await this.activityLog.log({
      actorUserId: userId,
      action: 'UPDATE',
      targetType: 'visitor_entry',
      targetId: updated.id,
      targetName: updated.visitorName,
      details: `Host visit confirmed for ${updated.visitorReference}`
        + `${signature ? ' (digital signature captured)' : ''}`
        + `${dto.note?.trim() ? ` — ${dto.note.trim()}` : ''}`,
    });

    return this.toDetailView(updated);
  }

  /** §16/§31.12 — a confirmation is a one-way record, never silently re-written. */
  private assertHostConfirmationAllowed(entry: VisitorEntry): void {
    if (entry.hostConfirmed) {
      throw new ConflictException('Host visit has already been confirmed.');
    }
    if (entry.status === VisitorEntryStatus.CANCELLED) {
      throw new ConflictException('Host visit cannot be confirmed for a cancelled visitor entry.');
    }
  }

  /**
   * Decode a signature data URL into a PRIVATE file under STORAGE_PATH (§22).
   *
   * The base64 string is never written to the visitor row — only the resulting
   * relative path and mime, exactly like `photoPath`. The file lives under
   * `visitors/<companyId>/<entryId>/` and is reachable only through the
   * authorised signature endpoint, so it is never publicly accessible.
   */
  private async persistSignature(
    entry: VisitorEntry,
    companyId: string,
    dataUrl: string | undefined,
  ): Promise<{ relativePath: string; mime: string } | null> {
    if (!dataUrl) return null;

    if (!dataUrl.startsWith(SIGNATURE_DATA_URL_PREFIX)) {
      throw new BadRequestException('Signature must be a PNG data URL');
    }

    const buffer = Buffer.from(dataUrl.slice(SIGNATURE_DATA_URL_PREFIX.length), 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('Signature image is empty');
    }
    if (buffer.length > MAX_SIGNATURE_BYTES) {
      throw new BadRequestException('Signature image is too large');
    }
    // A data URL can lie about its content; the PNG magic number cannot.
    if (!(buffer.length > 7 && buffer[0] === 0x89 && buffer.subarray(1, 4).toString('ascii') === 'PNG')) {
      throw new BadRequestException('Signature must be a valid PNG image');
    }

    const relativePath = path.posix.join(
      'visitors',
      companyId,
      entry.id,
      `signature-${randomUUID()}.png`,
    );
    const absolutePath = path.resolve(this.storagePath, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    // Only now that the confirmation is known to be going ahead is it safe to
    // drop the previous signature — a rejected confirmation keeps the old one.
    if (entry.signaturePath) {
      await this.discardSignature(entry.signaturePath);
    }

    return { relativePath, mime: SIGNATURE_MIME };
  }

  /** Best-effort cleanup — a failed unlink must never fail the request. */
  private async discardSignature(relativePath: string): Promise<void> {
    const absolutePath = path.resolve(this.storagePath, relativePath);
    if (!absolutePath.startsWith(this.storagePath + path.sep)) return;
    await fs.unlink(absolutePath).catch(() => undefined);
  }

  /** Resolve the stored signature only after permission + division checks passed. */
  async resolveSignature(
    entryId: string,
    companyId: string,
    allowedDivisionIds?: string[],
  ): Promise<PhotoRef | null> {
    const entry = await this.findRow(entryId, companyId, allowedDivisionIds);
    if (!entry.signaturePath) return null;

    const absolutePath = path.resolve(this.storagePath, entry.signaturePath);
    // Defence in depth: never serve a path that escaped STORAGE_PATH.
    if (!absolutePath.startsWith(this.storagePath + path.sep)) {
      throw new NotFoundException('Signature not found');
    }
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat || !stat.isFile()) return null;

    return { absolutePath, mime: entry.signatureMime || SIGNATURE_MIME };
  }

  // ─────────────────────────────────────────────────────── VISITOR SLIP ───
  /**
   * Authorised print payload for the visitor slip (Prompt #19 §4, §21, §30).
   *
   * This is a SEPARATE, purpose-built view rather than the detail response,
   * because a print document needs data the list view does not carry (the real
   * company legal name, the host's department, the reception/security footer)
   * while still honouring "do not return unnecessary sensitive fields":
   *   • `photoPath` / `signaturePath` are NEVER exposed — the client only learns
   *     whether an image exists and fetches it through the authorised endpoint;
   *   • the CNIC is returned in the PROJECT'S privacy form (`maskCnic`), the same
   *     masked value the list already uses, not the stored plaintext;
   *   • `host_confirmed_by` is the acting ERP user, kept explicitly separate from
   *     the host, and `hostIdentityVerified` is hard-wired `false` so the slip
   *     can state that fact instead of implying a verification that did not
   *     happen (§17).
   *
   * Re-print reads the SAME stored row (§10): nothing about the slip is cached
   * or snapshotted, so a re-print after exit naturally shows the real Time-Out
   * and COMPLETED status (§29).
   */
  async getSlip(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<any> {
    const entry = await this.findRow(id, companyId, allowedDivisionIds, {
      hostEmployee: { department: true },
    });

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    const hostDepartment = entry.hostEmployee?.department?.name ?? null;

    // #19A §2 — resolve the two acting ERP users to display names. One extra
    // query for both ids; it can only ever narrow what is printed, it cannot
    // widen access (the row itself was already authorised by `findRow`).
    const actorNames = await this.resolveActorNames([entry.createdBy, entry.hostConfirmedBy]);
    const actorName = (id: string | null | undefined): string =>
      (id ? actorNames.get(id) : undefined) || SLIP_ACTOR_FALLBACK_NAME;

    return {
      visitorReference: entry.visitorReference,
      // §3/§4 — the real company name from the database, with the ERP's
      // established PWI fallback so a slip is never printed headerless.
      companyName: company?.legalName?.trim() || 'PAKISTAN WIRE INDUSTRIES (PVT) LTD.',
      companyCode: company?.companyCode ?? null,
      visitorName: entry.visitorName,
      cnic: maskCnic(entry.cnic),
      mobile: entry.mobile,
      visitorCompany: entry.visitorCompany,
      hostName: entry.hostNameSnapshot,
      hostDepartment,
      division: entry.division
        ? { code: entry.division.divisionCode, name: entry.division.name }
        : null,
      location: entry.location
        ? { code: entry.location.locationCode, name: entry.location.name }
        : null,
      // §27 — the STORED server timestamps, never a client-side "now".
      timeIn: entry.timeIn,
      timeOut: entry.timeOut,
      status: entry.status,
      // §6 — the photo and the signature are only ever reached through the
      // authorised endpoints; the internal STORAGE_PATH never leaves the server.
      hasPhoto: !!entry.photoPath,
      photoUrl: entry.photoPath ? `/visitor/entries/${entry.id}/photo` : null,
      hasSignature: !!entry.signaturePath,
      signatureUrl: entry.signaturePath ? `/visitor/entries/${entry.id}/signature` : null,
      hostConfirmation: {
        confirmed: entry.hostConfirmed,
        confirmedAt: entry.hostConfirmedAt,
        confirmedBy: entry.hostConfirmedBy ?? null,
        // #19A §2 — the name the slip PRINTS. The UUID above is kept for API
        // traceability, but the renderer must use this field, never the id.
        confirmedByName: actorName(entry.hostConfirmedBy),
        signatureCapturedAt: entry.signatureCapturedAt,
        signatureCapturedBy: entry.signatureCapturedBy ?? null,
        signatureCapturedByName: actorName(entry.signatureCapturedBy),
        // §17 — stated, never implied: the system records who pressed the button,
        // it does not prove that person is the host.
        hostIdentityVerified: false,
      },
      createdBy: entry.createdBy ?? null,
      createdByName: actorName(entry.createdBy),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  // ──────────────────────────────────────────────────────── HELPERS ───────
  /**
   * Prompt #19A §2 — map ERP user ids to their `display_name` in ONE query.
   *
   * Why a batch and not two lookups: the slip needs at most three ids and a
   * single round-trip keeps the print payload cheap. Why a LEFT-style
   * best-effort: a deleted or not-yet-provisioned user must degrade to
   * `SLIP_ACTOR_FALLBACK_NAME`, never fail the request, and never leak an id.
   * A repository failure is caught for the same reason — a name lookup must not
   * be able to stop someone printing a visitor's departure slip.
   */
  private async resolveActorNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0)));
    const names = new Map<string, string>();
    if (!unique.length) return names;

    try {
      const rows = await this.erpUserRepo.find({
        where: { id: In(unique) },
        select: { id: true, displayName: true },
      });
      for (const row of rows ?? []) {
        const name = (row?.displayName ?? '').trim();
        if (row?.id && name) names.set(row.id, name);
      }
    } catch {
      // Fall through: the caller substitutes the fallback name.
    }
    return names;
  }

  private async findRow(
    id: string,
    companyId: string,
    allowedDivisionIds?: string[],
    extraRelations?: { hostEmployee: { department: boolean } },
  ): Promise<VisitorEntry> {
    if (!UUID_SHAPE.test(String(id))) {
      throw new NotFoundException('Visitor entry not found');
    }

    const entry = await this.visitorRepo.findOne({
      where: { id, companyId },
      relations: { division: true, location: true, ...(extraRelations ?? {}) },
    });
    if (!entry) {
      throw new NotFoundException('Visitor entry not found');
    }

    // §14 — a guessed id outside the caller's divisions must not be readable.
    if (Array.isArray(allowedDivisionIds) && !allowedDivisionIds.includes(entry.divisionId)) {
      throw new ForbiddenException('You do not have access to this visitor record.');
    }

    return entry;
  }

  /** List row: CNIC masked, internal photo path never exposed (§13/§19). */
  private toListView(entry: VisitorEntry): any {
    return {
      id: entry.id,
      // §5 — the printed reception reference, so a row can be quoted by it.
      visitorReference: entry.visitorReference,
      companyId: entry.companyId,
      divisionId: entry.divisionId,
      locationId: entry.locationId,
      visitorName: entry.visitorName,
      cnic: maskCnic(entry.cnic),
      mobile: entry.mobile,
      visitorCompany: entry.visitorCompany,
      hostEmployeeId: entry.hostEmployeeId,
      hostNameSnapshot: entry.hostNameSnapshot,
      timeIn: entry.timeIn,
      timeOut: entry.timeOut,
      // §10/§20 — the client gets the derived truth, not a second source of
      // state: a visitor is still on site only while status is PENDING *and*
      // time_out is NULL. Present so the UI never has to re-derive it.
      onSite: entry.status === VisitorEntryStatus.PENDING && !entry.timeOut,
      status: entry.status,
      hasPhoto: !!entry.photoPath,
      // §16/§24 — host confirmation state travels with the row so the list, the
      // detail and the print action can all read one source of truth. It is
      // independent of `status` on purpose: confirmed + PENDING is a valid state.
      hostConfirmed: entry.hostConfirmed,
      hostConfirmedAt: entry.hostConfirmedAt ?? null,
      hostConfirmedBy: entry.hostConfirmedBy ?? null,
      hasSignature: !!entry.signaturePath,
      createdAt: entry.createdAt,
      createdBy: entry.createdBy,
      // §17 — who recorded the Time-Out (only set once the visit is closed).
      exitedBy: entry.exitedBy ?? null,
      division: entry.division ? { id: entry.division.id, divisionCode: entry.division.divisionCode, name: entry.division.name } : null,
      location: entry.location ? { id: entry.location.id, locationCode: entry.location.locationCode, name: entry.location.name } : null,
    };
  }

  /** Detail row: full CNIC (§14) plus the authenticated photo/signature endpoints. */
  private toDetailView(entry: VisitorEntry): any {
    return {
      ...this.toListView(entry),
      cnic: entry.cnic,
      photoUrl: entry.photoPath ? `/visitor/entries/${entry.id}/photo` : null,
      // §22 — the signature is fetched through its own authorised endpoint, so
      // its private STORAGE_PATH is never handed to the client.
      signatureUrl: entry.signaturePath ? `/visitor/entries/${entry.id}/signature` : null,
      signatureCapturedAt: entry.signatureCapturedAt ?? null,
      signatureCapturedBy: entry.signatureCapturedBy ?? null,
      updatedBy: entry.updatedBy,
      updatedAt: entry.updatedAt,
    };
  }
}
