'use client';

import { DeleteOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Space, Upload } from 'antd';
import { useState } from 'react';
import { fileUrl, uploadFile } from '@/lib/api';
import { errorMessage } from '@/lib/form';

interface StoredFile {
  id: string;
  originalName: string;
}

const DEFAULT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';

/** Ô chọn file cho antd Form: giá trị là id file đã tải lên. */
export function FileUpload({
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  disabled,
}: {
  value?: string | null;
  onChange?: (id: string | null) => void;
  accept?: string;
  disabled?: boolean;
}) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState<string>();

  return (
    <Space wrap>
      {value && (
        <a href={fileUrl(value)} target="_blank" rel="noreferrer">
          <PaperClipOutlined /> {name ?? 'Xem file đính kèm'}
        </a>
      )}
      {!disabled && (
        <Upload
          accept={accept}
          showUploadList={false}
          customRequest={async ({ file }) => {
            setUploading(true);
            try {
              const f = await uploadFile<StoredFile>('/files', file as File);
              setName(f.originalName);
              onChange?.(f.id);
            } catch (e) {
              message.error(errorMessage(e));
            } finally {
              setUploading(false);
            }
          }}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>
            {value ? 'Thay file' : 'Chọn file'}
          </Button>
        </Upload>
      )}
      {value && !disabled && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(null)} aria-label="Bỏ file" />}
    </Space>
  );
}
