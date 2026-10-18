import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@bachmai/db';
import type { AuthUser } from '../../common/auth/auth-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REPO_ROOT } from '../../paths';
import { ALLOWED_TYPES, detectAllowedType } from './file-type';

export interface UploadedFileInput {
  originalname: string;
  size: number;
  buffer: Buffer;
}

/** Kiểm tra quyền đọc file theo đối tượng sở hữu (vd 'employee' → có quyền xem hồ sơ đó không). */
export type FileAccessChecker = (user: AuthUser, ownerId: string) => Promise<boolean>;

@Injectable()
export class FilesService {
  private readonly root: string;
  private readonly maxBytes: number;
  private readonly checkers = new Map<string, FileAccessChecker>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const dir = config.get<string>('STORAGE_DIR', 'storage');
    this.root = isAbsolute(dir) ? dir : join(REPO_ROOT, dir);
    this.maxBytes = Number(config.get('UPLOAD_MAX_MB', 20)) * 1024 * 1024;
  }

  /** Module nghiệp vụ đăng ký cách kiểm tra quyền cho file của mình. */
  registerAccessChecker(ownerType: string, checker: FileAccessChecker) {
    this.checkers.set(ownerType, checker);
  }

  async save(file: UploadedFileInput | undefined, actor: AuthUser) {
    if (!file) throw new BadRequestException('Chưa chọn file');
    if (file.size > this.maxBytes) throw new BadRequestException(`File vượt quá ${this.maxBytes / 1024 / 1024} MB`);
    // multer giải mã tên file theo latin1 — đổi về UTF-8 để giữ tiếng Việt
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255);
    const ext = extname(originalName).toLowerCase();
    const type = detectAllowedType(ext, file.buffer);
    if (!type) {
      throw new BadRequestException(
        `Định dạng không được hỗ trợ hoặc nội dung không khớp đuôi file. Cho phép: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
      );
    }
    const now = new Date();
    const storageKey = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`;
    const fullPath = join(this.root, storageKey);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, file.buffer);

    return this.prisma.storedFile.create({
      data: {
        originalName,
        mimeType: type.mime,
        size: file.size,
        storageKey,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        createdBy: actor.id,
      },
      select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
    });
  }

  /**
   * Gắn file vào đối tượng sở hữu. Chỉ gắn được file do chính người dùng tải lên và chưa thuộc
   * đối tượng nào, hoặc file đã thuộc đúng đối tượng này.
   */
  async attach(
    fileIds: (string | null | undefined)[],
    ownerType: string,
    ownerId: string,
    actor: AuthUser,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const ids = [...new Set(fileIds.filter((x): x is string => !!x))];
    if (!ids.length) return;
    const files = await tx.storedFile.findMany({ where: { id: { in: ids } } });
    for (const id of ids) {
      const f = files.find((x) => x.id === id);
      if (!f) throw new BadRequestException('File đính kèm không tồn tại');
      const sameOwner = f.ownerType === ownerType && f.ownerId === ownerId;
      if (!sameOwner && (f.ownerType || f.createdBy !== actor.id)) {
        throw new ForbiddenException('Không thể đính kèm file này');
      }
    }
    await tx.storedFile.updateMany({ where: { id: { in: ids }, ownerType: null }, data: { ownerType, ownerId } });
  }

  async open(id: string, user: AuthUser) {
    const file = await this.prisma.storedFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('Không tìm thấy file');
    if (!(await this.canRead(user, file))) throw new ForbiddenException('Bạn không có quyền xem file này');
    const fullPath = normalize(join(this.root, file.storageKey));
    if (!fullPath.startsWith(normalize(this.root))) throw new ForbiddenException();
    const inline = ALLOWED_TYPES[extname(file.storageKey)]?.inline ?? false;
    return { file, inline, stream: createReadStream(fullPath) };
  }

  private async canRead(user: AuthUser, file: { createdBy: string | null; ownerType: string | null; ownerId: string | null }) {
    if (file.ownerType && file.ownerId) {
      const checker = this.checkers.get(file.ownerType);
      return checker ? checker(user, file.ownerId) : false;
    }
    return file.createdBy === user.id;
  }
}
