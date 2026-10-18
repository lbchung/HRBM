'use client';

import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, Modal, Space, Statistic, Table, Upload } from 'antd';
import { useState } from 'react';
import { downloadFile, uploadFile } from '@/lib/api';
import { errorMessage } from '@/lib/form';

interface ImportResult {
  total: number;
  valid: number;
  toCreate: number;
  toUpdate: number;
  errors: { row: number; code: string | null; messages: string[] }[];
  committed: boolean;
}

/** Import 2 bước: kiểm tra file → xác nhận ghi. Chỉ ghi khi không còn dòng lỗi. */
export function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setResult(null);
  };

  const check = async (f: File) => {
    setFile(f);
    setBusy(true);
    try {
      setResult(await uploadFile<ImportResult>('/hr/employees/import', f, { commit: false }));
    } catch (e) {
      message.error(errorMessage(e));
      reset();
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadFile<ImportResult>('/hr/employees/import', file, { commit: true });
      if (r.committed) {
        message.success(`Đã import ${r.valid} hồ sơ (thêm mới ${r.toCreate}, cập nhật ${r.toUpdate})`);
        onImported();
        reset();
        onClose();
      } else setResult(r);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const canCommit = !!result && result.errors.length === 0 && result.valid > 0;

  return (
    <Modal
      open={open}
      title="Import hồ sơ nhân viên từ Excel"
      width={820}
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('/hr/employees/import/template', undefined, 'mau-import.xlsx').catch((e) => message.error(errorMessage(e)))}>
            Tải file mẫu
          </Button>
          {result && <Button onClick={reset}>Chọn file khác</Button>}
          <Button type="primary" disabled={!canCommit} loading={busy && !!result} onClick={commit}>
            Ghi {result?.valid ?? 0} hồ sơ
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      {!result ? (
        <Upload.Dragger accept=".xlsx" showUploadList={false} disabled={busy} customRequest={({ file: f }) => check(f as File)}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{busy ? 'Đang kiểm tra file…' : 'Kéo thả hoặc bấm để chọn file .xlsx'}</p>
          <p className="ant-upload-hint">
            Dùng file mẫu. Trùng mã nhân viên → cập nhật hồ sơ đã có (ô trống không xóa dữ liệu cũ). Tối đa 10.000 dòng.
          </p>
        </Upload.Dragger>
      ) : (
        <>
          <Space size={32} style={{ marginBottom: 16 }} wrap>
            <Statistic title="Tổng số dòng" value={result.total} />
            <Statistic title="Hợp lệ" value={result.valid} valueStyle={{ color: 'var(--bm-primary)' }} />
            <Statistic title="Thêm mới" value={result.toCreate} />
            <Statistic title="Cập nhật" value={result.toUpdate} />
            <Statistic title="Lỗi" value={result.errors.length} valueStyle={{ color: result.errors.length ? '#cf1322' : undefined }} />
          </Space>
          {result.errors.length ? (
            <>
              <Alert type="error" showIcon style={{ marginBottom: 12 }} message="Sửa các dòng lỗi trong file rồi kiểm tra lại. Hệ thống chỉ ghi khi toàn bộ file hợp lệ." />
              <Table
                size="small"
                rowKey="row"
                dataSource={result.errors}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Dòng', dataIndex: 'row', width: 70 },
                  { title: 'Mã NV', dataIndex: 'code', width: 110 },
                  { title: 'Lỗi', dataIndex: 'messages', render: (m: string[]) => m.map((x) => <div key={x}>• {x}</div>) },
                ]}
              />
            </>
          ) : (
            <Alert type="success" showIcon message="File hợp lệ. Bấm “Ghi” để lưu vào hệ thống." />
          )}
        </>
      )}
    </Modal>
  );
}
