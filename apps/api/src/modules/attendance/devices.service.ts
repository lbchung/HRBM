import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AttendanceDevice } from '@bachmai/db';
import {
  DEVICE_CLOCK_DRIFT_WARN_SECONDS,
  DEVICE_OFFLINE_AFTER_MINUTES,
  addDays,
  toVnDate,
  type CreateDeviceInput,
  type UpdateDeviceInput,
} from '@bachmai/shared';
import type { AuthUser, RequestMeta } from '../../common/auth/auth-user';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { AuditService } from '../audit/audit.service';
import {
  QUEUE_DEVICE_SYNC,
  SYNC_INITIAL_DAYS,
  SYNC_MAX_BACKFILL_DAYS,
  SYNC_OVERLAP_MINUTES,
  type RecomputeItem,
} from './attendance.constants';
import { HikvisionIsapiClient, type DeviceEventSource } from './hikvision/isapi.client';
import { TimesheetService } from './timesheet.service';

const PUBLIC_SELECT = {
  id: true,
  code: true,
  name: true,
  campusId: true,
  location: true,
  host: true,
  port: true,
  useHttps: true,
  username: true,
  eventMinors: true,
  model: true,
  serialNumber: true,
  firmware: true,
  isActive: true,
  lastEventTime: true,
  lastSerialNo: true,
  lastSyncAt: true,
  lastSuccessAt: true,
  lastSyncStatus: true,
  lastError: true,
  lastFetchedCount: true,
  clockOffsetSeconds: true,
  createdAt: true,
  campus: { select: { id: true, code: true, name: true } },
} as const;

export type DeviceHealth = 'ONLINE' | 'OFFLINE' | 'NEVER' | 'DISABLED';

export function deviceHealth(d: Pick<AttendanceDevice, 'isActive' | 'lastSuccessAt'>, now = new Date()): DeviceHealth {
  if (!d.isActive) return 'DISABLED';
  if (!d.lastSuccessAt) return 'NEVER';
  return now.getTime() - d.lastSuccessAt.getTime() <= DEVICE_OFFLINE_AFTER_MINUTES * 60_000 ? 'ONLINE' : 'OFFLINE';
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger('DeviceSync');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
    private readonly queue: QueueService,
    private readonly timesheet: TimesheetService,
  ) {}

  /** Có thể thay thế trong test (máy giả lập) hoặc khi chuyển sang HikCentral */
  sourceFor(d: AttendanceDevice): DeviceEventSource {
    return new HikvisionIsapiClient({
      host: d.host,
      port: d.port,
      useHttps: d.useHttps,
      username: d.username,
      password: this.encryption.decrypt(d.passwordEnc) ?? '',
    });
  }

  async list() {
    const rows = await this.prisma.attendanceDevice.findMany({ where: { deletedAt: null }, select: PUBLIC_SELECT, orderBy: { code: 'asc' } });
    const now = new Date();
    return rows.map((d) => ({
      ...d,
      health: deviceHealth(d, now),
      clockDrift: d.clockOffsetSeconds !== null && Math.abs(d.clockOffsetSeconds) > DEVICE_CLOCK_DRIFT_WARN_SECONDS,
    }));
  }

  private async find(id: string) {
    const d = await this.prisma.attendanceDevice.findFirst({ where: { id, deletedAt: null } });
    if (!d) throw new NotFoundException('Không tìm thấy máy chấm công');
    return d;
  }

  async create(actor: AuthUser, input: CreateDeviceInput, meta: RequestMeta) {
    const { password, ...rest } = input;
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.attendanceDevice.create({
        data: { ...rest, location: rest.location ?? null, passwordEnc: this.encryption.encrypt(password)!, createdBy: actor.id, updatedBy: actor.id },
        select: PUBLIC_SELECT,
      });
      await this.audit.log({ actor, action: 'CREATE', entity: 'attendance_device', entityId: d.id, after: d, meta }, tx);
      return d;
    });
  }

  async update(actor: AuthUser, id: string, input: UpdateDeviceInput, meta: RequestMeta) {
    const before = await this.find(id);
    const { password, ...rest } = input;
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.attendanceDevice.update({
        where: { id },
        data: { ...rest, ...(password ? { passwordEnc: this.encryption.encrypt(password)! } : {}), updatedBy: actor.id },
        select: PUBLIC_SELECT,
      });
      await this.audit.log(
        { actor, action: 'UPDATE', entity: 'attendance_device', entityId: id, before, after: { ...d, passwordChanged: !!password }, meta },
        tx,
      );
      return d;
    });
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    const before = await this.find(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceDevice.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.log({ actor, action: 'DELETE', entity: 'attendance_device', entityId: id, before, meta }, tx);
    });
  }

  /** Kiểm tra kết nối: đọc thông tin máy + giờ máy */
  async test(id: string) {
    const d = await this.find(id);
    const src = this.sourceFor(d);
    try {
      const info = await src.deviceInfo();
      const time = await src.deviceTime().catch(() => null);
      const offset = time ? Math.round((time.getTime() - Date.now()) / 1000) : null;
      await this.prisma.attendanceDevice.update({ where: { id }, data: { ...info, clockOffsetSeconds: offset } });
      return { ok: true, ...info, deviceTime: time, clockOffsetSeconds: offset };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async enqueueSync(id: string) {
    await this.find(id);
    const job = await this.queue.add(QUEUE_DEVICE_SYNC, 'sync-device', { deviceId: id }, { jobId: `manual-${id}-${Date.now()}` });
    return { jobId: job.id };
  }

  /** Lịch 5 phút: tạo job đồng bộ cho từng máy đang hoạt động */
  async enqueueAll() {
    const devices = await this.prisma.attendanceDevice.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } });
    const slot = Math.floor(Date.now() / 300_000); // mỗi máy tối đa 1 job / chu kỳ 5 phút
    for (const d of devices) {
      await this.queue.add(QUEUE_DEVICE_SYNC, 'sync-device', { deviceId: d.id }, {
        jobId: `sync-${d.id}-${slot}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      });
    }
    return devices.length;
  }

  /**
   * Đồng bộ một máy: lấy sự kiện từ watermark (lùi SYNC_OVERLAP_MINUTES), chống trùng theo (máy, serial),
   * gắn nhân viên theo mã chấm công, cập nhật watermark + tình trạng máy, rồi xếp hàng tính lại công.
   */
  async syncDevice(deviceId: string) {
    const d = await this.find(deviceId);
    const now = new Date();
    const minFrom = now.getTime() - SYNC_MAX_BACKFILL_DAYS * 86_400_000;
    const from = new Date(
      Math.max(minFrom, d.lastEventTime ? d.lastEventTime.getTime() - SYNC_OVERLAP_MINUTES * 60_000 : now.getTime() - SYNC_INITIAL_DAYS * 86_400_000),
    );
    await this.prisma.attendanceDevice.update({ where: { id: deviceId }, data: { lastSyncAt: now, lastSyncStatus: 'RUNNING' } });

    try {
      const src = this.sourceFor(d);
      const minors = d.eventMinors.split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
      const events = await src.fetchEvents(from, now, minors);
      const deviceTime = await src.deviceTime().catch(() => null);

      const codes = [...new Set(events.map((e) => e.employeeNo))];
      const emps = codes.length
        ? await this.prisma.employee.findMany({ where: { attendanceCode: { in: codes }, deletedAt: null }, select: { id: true, attendanceCode: true } })
        : [];
      const empOf = new Map(emps.map((e) => [e.attendanceCode!, e.id]));

      const inserted = await this.prisma.attendancePunch.createMany({
        data: events.map((e) => ({
          deviceId,
          serialNo: e.serialNo,
          employeeNo: e.employeeNo,
          employeeId: empOf.get(e.employeeNo) ?? null,
          punchTime: e.time,
          campusId: d.campusId,
          verifyMode: e.verifyMode,
          eventMinor: e.minor,
          personName: e.name?.slice(0, 200) ?? null,
        })),
        skipDuplicates: true,
      });

      const maxTime = events.reduce<Date | null>((m, e) => (!m || e.time > m ? e.time : m), d.lastEventTime);
      const maxSerial = events.reduce<number | null>((m, e) => (m === null || e.serialNo > m ? e.serialNo : m), d.lastSerialNo);
      await this.prisma.attendanceDevice.update({
        where: { id: deviceId },
        data: {
          lastEventTime: maxTime,
          lastSerialNo: maxSerial,
          lastSuccessAt: new Date(),
          lastSyncStatus: 'OK',
          lastError: null,
          lastFetchedCount: events.length,
          clockOffsetSeconds: deviceTime ? Math.round((deviceTime.getTime() - Date.now()) / 1000) : d.clockOffsetSeconds,
        },
      });

      // Tính lại công: ngày có lượt quét + ngày trước đó (ca qua đêm)
      const items: RecomputeItem[] = [];
      for (const e of events) {
        const employeeId = empOf.get(e.employeeNo);
        if (!employeeId) continue;
        const day = toVnDate(e.time);
        items.push({ employeeId, from: addDays(day, -1), to: day });
      }
      if (inserted.count) await this.timesheet.enqueueRecompute(items);
      return { fetched: events.length, inserted: inserted.count, unmapped: events.filter((e) => !empOf.has(e.employeeNo)).length };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Máy ${d.code}: ${message}`);
      await this.prisma.attendanceDevice.update({ where: { id: deviceId }, data: { lastSyncStatus: 'ERROR', lastError: message.slice(0, 1000) } });
      throw e; // để BullMQ thử lại theo backoff
    }
  }
}
