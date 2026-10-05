import { useEffect, useState } from "react";
import { App, List, Typography } from "antd";
import { fetchFeedback } from "../lib/api";

export default function FeedbackPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchFeedback>>["data"]["items"]>([]);
  useEffect(() => {
    fetchFeedback().then((result) => setItems(result.data.items)).catch((caught) => message.error(caught instanceof Error ? caught.message : "加载失败"));
  }, [message]);
  return (
    <div className="overview-page">
      <Typography.Title level={2}>用户反馈</Typography.Title>
      <List dataSource={items} locale={{ emptyText: "还没有反馈" }} renderItem={(item) => (
        <List.Item>
          <List.Item.Meta title={`${item.email} · ${new Date(item.created_at).toLocaleString("zh-CN")}`} description={item.content} />
        </List.Item>
      )} />
    </div>
  );
}
