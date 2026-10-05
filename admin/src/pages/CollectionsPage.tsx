import { useEffect, useState } from "react";
import { App, Button, Space, Table, Tag, Typography } from "antd";
import { fetchCollections } from "../lib/api";

const labels: Record<string, string> = { collecting: "采集中", succeeded: "已完成", failed: "失败" };

export default function CollectionsPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchCollections>>["data"]["items"]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const load = (nextPage: number) => {
    fetchCollections(nextPage).then((result) => {
      setRows(result.data.items);
      setPage(result.data.page);
      setHasMore(result.data.has_more);
    }).catch((caught) => message.error(caught instanceof Error ? caught.message : "加载失败"));
  };
  useEffect(() => { load(1); }, [message]);
  return (
    <div className="overview-page">
      <Typography.Title level={2}>采集记录</Typography.Title>
      <Table rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 900 }} columns={[
        { title: "用户", dataIndex: "user_email" },
        { title: "商品", dataIndex: "title", render: (title: string, row) => title || row.source_url },
        { title: "ASIN", dataIndex: "asin" },
        { title: "状态", dataIndex: "status", render: (status: string) => <Tag>{labels[status] || status}</Tag> },
        { title: "失败原因", dataIndex: "error_message" },
      ]} />
      <Space className="status-alert">
        <Button disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
        <span>第 {page} 页</span>
        <Button disabled={!hasMore} onClick={() => load(page + 1)}>下一页</Button>
      </Space>
    </div>
  );
}
