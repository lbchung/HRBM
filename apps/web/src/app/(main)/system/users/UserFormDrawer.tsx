'use client';

import { App, Button, Col, Drawer, Form, Input, Row, Select, Switch, TreeSelect } from 'antd';
import { useEffect, useState } from 'react';
import { createUserSchema, usernameSchema } from '@bachmai/shared';
import { api } from '@/lib/api';
import { applyServerErrors, errorMessage, zodRule } from '@/lib/form';
import { buildUnitTree, useCampuses, useRoles, useUnits } from '@/lib/queries';
import type { UserRow } from './types';

interface Props {
  open: boolean;
  user: UserRow | null;
  onClose: () => void;
  onSaved: (username: string, temporaryPassword?: string) => void;
}

interface FormValues {
  username: string;
  fullName: string;
  email?: string;
  phone?: string;
  campusId?: string | null;
  unitId?: string | null;
  roleIds: string[];
  managedUnitIds: string[];
  password?: string;
  active?: boolean;
}

export function UserFormDrawer({ open, user, onClose, onSaved }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();
  const { data: campuses } = useCampuses();
  const { data: units } = useUnits();
  const { data: roles } = useRoles();
  const isNew = !user;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (user) {
      form.setFieldsValue({
        username: user.username,
        fullName: user.fullName,
        email: user.email ?? undefined,
        phone: user.phone ?? undefined,
        campusId: user.campusId,
        unitId: user.unitId,
        roleIds: user.roles.map((r) => r.id),
        managedUnitIds: user.managedUnits.map((u) => u.id),
        active: user.status !== 'DISABLED',
      });
    }
  }, [open, user, form]);

  const submit = async (v: FormValues) => {
    setSaving(true);
    const body = {
      fullName: v.fullName,
      email: v.email ?? '',
      phone: v.phone ?? '',
      campusId: v.campusId ?? null,
      unitId: v.unitId ?? null,
      roleIds: v.roleIds,
      managedUnitIds: v.managedUnitIds ?? [],
    };
    try {
      if (isNew) {
        const r = await api<{ temporaryPassword?: string }>('/users', {
          method: 'POST',
          body: { ...body, username: v.username, password: v.password ?? '' },
        });
        onSaved(v.username, r.temporaryPassword);
      } else {
        // Chỉ gửi trạng thái khi thay đổi bật/tắt (khóa/mở khóa dùng chức năng riêng)
        const status = v.active ? (user.status === 'DISABLED' ? 'ACTIVE' : undefined) : 'DISABLED';
        await api(`/users/${user.id}`, { method: 'PATCH', body: { ...body, status } });
        onSaved(user.username);
      }
    } catch (e) {
      if (!applyServerErrors(form, e)) message.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const unitTree = units ? buildUnitTree(units) : [];

  return (
    <Drawer
      title={isNew ? 'Thêm tài khoản' : `Sửa tài khoản: ${user.username}`}
      open={open}
      onClose={onClose}
      width={640}
      destroyOnHidden
      extra={
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          Lưu
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ roleIds: [], managedUnitIds: [], active: true }}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="username" label="Tên đăng nhập" rules={isNew ? [{ required: true, message: 'Nhập tên đăng nhập' }, zodRule(usernameSchema)] : []}>
              <Input disabled={!isNew} placeholder="vd: nguyenvana" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="email" label="Email" rules={[zodRule(createUserSchema.shape.email)]}>
              <Input type="email" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="phone" label="Điện thoại">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="campusId" label="Cơ sở" extra="Dùng cho phạm vi dữ liệu theo cơ sở">
              <Select allowClear options={campuses?.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="unitId" label="Đơn vị">
              <TreeSelect allowClear showSearch treeNodeFilterProp="title" treeData={unitTree} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="roleIds" label="Nhóm tài khoản" rules={[{ required: true, message: 'Chọn ít nhất một nhóm tài khoản' }]}>
              <Select mode="multiple" options={roles?.map((r) => ({ value: r.id, label: r.name }))} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="managedUnitIds"
              label="Đơn vị phụ trách"
              extra="Dành cho trưởng khoa/phòng phụ trách nhiều đơn vị — dùng cho phạm vi dữ liệu theo đơn vị"
            >
              <TreeSelect multiple allowClear showSearch treeNodeFilterProp="title" treeData={unitTree} treeCheckable showCheckedStrategy={TreeSelect.SHOW_ALL} />
            </Form.Item>
          </Col>
          {isNew ? (
            <Col span={24}>
              <Form.Item
                name="password"
                label="Mật khẩu ban đầu"
                extra="Bỏ trống để hệ thống tự tạo mật khẩu tạm. Người dùng bắt buộc đổi mật khẩu khi đăng nhập lần đầu."
                rules={[zodRule(createUserSchema.shape.password)]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
          ) : (
            <Col span={24}>
              <Form.Item name="active" label="Cho phép hoạt động" valuePropName="checked" extra="Tắt để vô hiệu hóa tài khoản (đăng xuất ngay)">
                <Switch />
              </Form.Item>
            </Col>
          )}
        </Row>
      </Form>
    </Drawer>
  );
}
