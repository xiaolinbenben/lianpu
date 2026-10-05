import { useEffect, useState } from "react";
import { App, Button, Card, Form, Input, InputNumber, Space, Switch, Typography } from "antd";
import { fetchSettings, saveSettings, testRainforest, testSMTP, type Settings } from "../lib/api";

export default function SettingsPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loaded, setLoaded] = useState<Settings | null>(null);
  const [clearKey, setClearKey] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);

  useEffect(() => {
    fetchSettings().then((result) => {
      setLoaded(result.data);
      form.setFieldsValue(result.data);
    }).catch((caught) => message.error(caught instanceof Error ? caught.message : "加载失败"));
  }, [form, message]);

  const save = async (values: Settings & { rainforest_api_key?: string; smtp_password?: string }) => {
    try {
      const result = await saveSettings({
        public_base_url: values.public_base_url ?? "",
        signup_bonus: values.signup_bonus,
        cost_per_link: values.cost_per_link,
        max_links_per_submit: values.max_links_per_submit,
        worker_concurrency: values.worker_concurrency,
        rainforest_api_key: values.rainforest_api_key || undefined,
        clear_rainforest_api_key: clearKey,
        smtp_host: values.smtp_host ?? "",
        smtp_port: values.smtp_port,
        smtp_username: values.smtp_username ?? "",
        smtp_password: values.smtp_password || undefined,
        clear_smtp_password: clearPassword,
        smtp_from: values.smtp_from ?? "",
        smtp_from_name: values.smtp_from_name ?? "",
      });
      setLoaded(result.data);
      setClearKey(false);
      setClearPassword(false);
      form.setFieldsValue({ ...result.data, rainforest_api_key: "", smtp_password: "" });
      message.success("已保存");
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : "保存失败");
    }
  };

  return (
    <div className="overview-page">
      <Typography.Title level={2}>系统配置</Typography.Title>
      <Typography.Paragraph type="secondary">这些配置只保存在数据库里。密钥留空表示不修改。</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
        <Card title="站点与额度">
          <Form.Item label="站点地址" name="public_base_url" extra="邮件链接会用它，例如 https://example.com"><Input /></Form.Item>
          <Space size="large" wrap>
            <Form.Item label="注册赠送" name="signup_bonus"><InputNumber min={0} /></Form.Item>
            <Form.Item label="每条链接消耗" name="cost_per_link"><InputNumber min={0} /></Form.Item>
            <Form.Item label="单次最多链接" name="max_links_per_submit"><InputNumber min={1} max={100} /></Form.Item>
            <Form.Item label="采集并发" name="worker_concurrency"><InputNumber min={1} max={8} /></Form.Item>
          </Space>
        </Card>
        <Card className="status-alert" title="Rainforest" extra={loaded?.rainforest_configured ? "已设置" : "未设置"}>
          <Form.Item label="API Key" name="rainforest_api_key"><Input.Password placeholder="留空则保持原值" autoComplete="off" /></Form.Item>
          <Space>
            <Switch checked={clearKey} onChange={setClearKey} /> <span>清除已保存的 Key</span>
            <Button onClick={() => void testRainforest().then((result) => (result.data.ok ? message.success(result.data.message) : message.error(result.data.message))).catch((caught) => message.error(caught instanceof Error ? caught.message : "测试失败"))}>测试连接</Button>
          </Space>
        </Card>
        <Card className="status-alert" title="邮件" extra={loaded?.mail_ready ? "可以发信" : "还不能发信"}>
          <Form.Item label="SMTP 主机" name="smtp_host"><Input /></Form.Item>
          <Form.Item label="端口" name="smtp_port"><InputNumber min={1} max={65535} /></Form.Item>
          <Form.Item label="用户名" name="smtp_username"><Input /></Form.Item>
          <Form.Item label="密码" name="smtp_password"><Input.Password placeholder={loaded?.smtp_password_configured ? "已设置，留空不修改" : ""} autoComplete="off" /></Form.Item>
          <Space>
            <Switch checked={clearPassword} onChange={setClearPassword} /> <span>清除已保存的密码</span>
          </Space>
          <Form.Item label="发件邮箱" name="smtp_from"><Input /></Form.Item>
          <Form.Item label="发件名称" name="smtp_from_name"><Input /></Form.Item>
          <Form.Item label="测试收件邮箱" name="test_to"><Input /></Form.Item>
          <Button onClick={() => void testSMTP(form.getFieldValue("test_to") || "").then((result) => (result.data.ok ? message.success(result.data.message) : message.error(result.data.message))).catch((caught) => message.error(caught instanceof Error ? caught.message : "测试失败"))}>发送测试信</Button>
        </Card>
        <Button className="status-alert" type="primary" htmlType="submit">保存</Button>
      </Form>
    </div>
  );
}
