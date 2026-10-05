import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Tag, Typography } from "antd";
import { fetchOverview } from "../lib/api";

export default function OverviewPage({ email }: { email: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOverview>>["data"] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchOverview().then((result) => setData(result.data)).catch((caught) => setError(caught instanceof Error ? caught.message : "加载失败"));
  }, []);

  return (
    <div className="overview-page">
      <Typography.Title level={2}>概览</Typography.Title>
      <Typography.Paragraph type="secondary">当前登录 {email}</Typography.Paragraph>
      {error && <Typography.Paragraph type="danger">{error}</Typography.Paragraph>}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}><Card><Statistic title="用户" value={data?.user_count ?? "—"} /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card><Statistic title="今日采集" value={data?.collected_today ?? "—"} /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card><Statistic title="今日成功" value={data?.succeeded_today ?? "—"} /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card><Statistic title="今日失败" value={data?.failed_today ?? "—"} /></Card></Col>
        <Col xs={24} sm={12} lg={8}><Card><Statistic title="今日消耗额度" value={data?.credits_spent_today ?? "—"} /></Card></Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Typography.Text>外部服务</Typography.Text>
            <div className="status-alert">
              <Tag color={data?.rainforest_configured ? "success" : "warning"}>Rainforest {data?.rainforest_configured ? "已配置" : "未配置"}</Tag>
              <Tag color={data?.smtp_configured ? "success" : "warning"}>邮件 {data?.smtp_configured ? "已配置" : "未配置"}</Tag>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
