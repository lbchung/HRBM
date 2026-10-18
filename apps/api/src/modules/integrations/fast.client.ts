import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Lớp kết nối phần mềm nhân sự Fast (anti-corruption layer).
 * ⏳ Chờ tài liệu API Fast: endpoint, cách xác thực, cấu trúc dữ liệu.
 * Khi có tài liệu: hiện thực các hàm fetch* trả về dữ liệu ĐÃ CHUYỂN sang model nội bộ,
 * code nghiệp vụ không phụ thuộc cấu trúc dữ liệu của Fast.
 */
export interface FastEmployeeRecord {
  externalId: string;
  code: string;
  fullName: string;
  // Bổ sung khi có tài liệu API
}

@Injectable()
export class FastClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('FAST_API_URL', '').trim();
    this.apiKey = config.get<string>('FAST_API_KEY', '').trim();
  }

  isConfigured() {
    return !!this.baseUrl && !!this.apiKey;
  }

  /** Lấy nhân viên thay đổi kể từ `since` (đồng bộ incremental). */
  async fetchEmployees(_since: Date | null): Promise<FastEmployeeRecord[]> {
    this.assertConfigured();
    throw new Error('Chưa hiện thực: cần tài liệu API của phần mềm Fast');
  }

  private assertConfigured() {
    if (!this.isConfigured()) throw new Error('Chưa cấu hình kết nối Fast (FAST_API_URL, FAST_API_KEY trong .env)');
  }
}
