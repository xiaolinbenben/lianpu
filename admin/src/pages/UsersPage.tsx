import { useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography } from "antd";
import { adjustCredits, fetchUsers, verifyUser } from "../lib/api";

type UserRow = { id: number; email: string; verified: boolean; balance: number; created_at: string };

export default function UsersPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [target, setTarget] = useState<UserRow | null>(null);

  const load = (nextPage: number) => fetchUsers(nextPage).then((result) => {
    setRows(result.data.items);
    setPage(result.data.page);
    setHasMore(result.data.has_more);
  }).catch((caught) => message.error(caught instanceof Error ? caught.message : "加载失败"));
  useEffect(() => { void load(1); }, []);

  return (
    <div className="overview-page">
      <Typography.Title level={2}>用户</Typography.Title>
      <Table rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 720 }} columns={[
        { title: "邮箱", dataIndex: "email" },
        { title: "验证", dataIndex: "verified", render: (verified: boolean) => <Tag color={verified ? "success" : "warning"}>{verified ? "已验证" : "未验证"}</Tag> },
        { title: "额度", dataIndex: "balance" },
        { title: "注册时间", dataIndex: "created_at", render: (value: string) => new Date(value).toLocaleString("zh-CN") },
        { title: "操作", render: (_: unknown, row: UserRow) => (
          <Space>
            {!row.verified && <Button size="small" onClick={() => void verifyUser(row.id).then(() => load(page)).catch((caught) => message.error(caught instanceof Error ? caught.message : "验证失败"))}>标记已验证</Button>}
            <Button size="small" onClick={() => setTarget(row)}>调整额度</Button>
          </Space>
        ) },
      ]} />
      <Space className="status-alert">
        <Button disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
        <span>第 {page} 页</span>
        <Button disabled={!hasMore} onClick={() => load(page + 1)}>下一页</Button>
      </Space>
      <Modal title={target ? `调整 ${target.email}` : ""} open={!!target} onCancel={() => setTarget(null)} footer={null} destroyOnClose>
        <Form layout="vertical" onFinish={(values: { delta: number; note: string }) => {
          if (!target) return;
          void adjustCredits(target.id, values.delta, values.note).then(() => {
            setTarget(null);
            return load(page);
          }).catch((caught) => message.error(caught instanceof Error ? caught.message : "调整失败"));
        }}>
          <Form.Item label="增减数量" name="delta" rules={[{ required: true }]}><InputNumber className="full-width" /></Form.Item>
          <Form.Item label="说明" name="note" rules={[{ required: true, message: "请填写说明" }]}><Input /></Form.Item>
          <Button type="primary" htmlType="submit">保存</Button>
        </Form>
      </Modal>
    </div>
  );
}
