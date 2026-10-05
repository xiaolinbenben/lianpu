import { useEffect, useMemo, useState } from "react";
import { App as AntApp, Button, Card, ConfigProvider, Form, Input, Layout, Typography, theme } from "antd";
import { AppstoreOutlined, MailOutlined, SettingOutlined, ShoppingOutlined, TableOutlined, UserOutlined } from "@ant-design/icons";
import { ProLayout } from "@ant-design/pro-components";
import { fetchSession, fetchSetup, login, logout, setupAdmin } from "./lib/api";
import CategoriesPage from "./pages/CategoriesPage";
import CollectionsPage from "./pages/CollectionsPage";
import FeedbackPage from "./pages/FeedbackPage";
import OverviewPage from "./pages/OverviewPage";
import SettingsPage from "./pages/SettingsPage";
import UsersPage from "./pages/UsersPage";

const pages = [
  { path: "/admin/", name: "概览", icon: <AppstoreOutlined /> },
  { path: "/admin/settings", name: "系统配置", icon: <SettingOutlined /> },
  { path: "/admin/users", name: "用户", icon: <UserOutlined /> },
  { path: "/admin/collections", name: "采集记录", icon: <ShoppingOutlined /> },
  { path: "/admin/categories", name: "类目模板", icon: <TableOutlined /> },
  { path: "/admin/feedback", name: "用户反馈", icon: <MailOutlined /> },
];

function currentPage() {
  const path = window.location.pathname.replace(/\/$/, "") || "/admin";
  if (path === "/admin") return "/admin/";
  return path.endsWith("/") ? path : path;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [initialized, setInitialized] = useState(true);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const page = currentPage();
  const routes = useMemo(() => ({ path: "/admin", routes: pages }), []);

  useEffect(() => {
    Promise.all([fetchSetup(), fetchSession().catch(() => null)])
      .then(([setup, session]) => {
        setInitialized(setup.data.initialized);
        setEmail(session?.data.email ?? "");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "加载失败"))
      .finally(() => setReady(true));
  }, []);

  const signIn = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    setError("");
    try {
      const result = await login(values.email, values.password);
      setEmail(result.data.email);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  const initialize = async (values: { email: string; password: string; password_confirm: string }) => {
    setSubmitting(true);
    setError("");
    try {
      const result = await setupAdmin(values.email, values.password, values.password_confirm);
      setInitialized(true);
      setEmail(result.data.email);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "初始化失败");
    } finally {
      setSubmitting(false);
    }
  };

  const body = page.startsWith("/admin/settings") ? <SettingsPage />
    : page.startsWith("/admin/users") ? <UsersPage />
    : page.startsWith("/admin/collections") ? <CollectionsPage />
    : page.startsWith("/admin/categories") ? <CategoriesPage />
    : page.startsWith("/admin/feedback") ? <FeedbackPage />
    : <OverviewPage email={email} />;

  return (
    <ConfigProvider button={{ autoInsertSpace: false }} theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: "#0f766e", borderRadius: 6 } }}>
      <AntApp>
        {!ready ? null : email ? (
          <ProLayout
            title="链铺"
            logo={false}
            route={routes}
            location={{ pathname: page === "/admin/" ? "/admin/" : page }}
            fixSiderbar
            menuItemRender={(item, dom) => <a href={item.path}>{dom}</a>}
            actionsRender={() => [<Button key="logout" type="text" onClick={() => void logout().then(() => setEmail(""))}>退出</Button>]}
          >
            <Layout.Content className="admin-content">{body}</Layout.Content>
          </ProLayout>
        ) : (
          <main className="login-page">
            <Card className="login-card" title={initialized ? "登录管理端" : "初始化管理端"}>
              <Typography.Paragraph type="secondary">
                {initialized ? "使用初始化时填写的邮箱和密码。" : "第一次打开时设置管理员邮箱和密码。密码要填两次。"}
              </Typography.Paragraph>
              {initialized ? (
                <Form layout="vertical" onFinish={(values) => void signIn(values)} requiredMark={false}>
                  <Form.Item label="邮箱" name="email" rules={[{ required: true, message: "请填写邮箱" }]}><Input autoComplete="username" /></Form.Item>
                  <Form.Item label="密码" name="password" rules={[{ required: true, message: "请填写密码" }]}><Input.Password autoComplete="current-password" /></Form.Item>
                  {error && <Typography.Paragraph type="danger">{error}</Typography.Paragraph>}
                  <Button type="primary" htmlType="submit" loading={submitting} block>登录</Button>
                </Form>
              ) : (
                <Form layout="vertical" onFinish={(values) => void initialize(values)} requiredMark={false}>
                  <Form.Item label="邮箱" name="email" rules={[{ required: true, type: "email", message: "请填写邮箱" }]}><Input autoComplete="username" /></Form.Item>
                  <Form.Item label="密码" name="password" rules={[{ required: true, message: "请填写密码" }]}><Input.Password autoComplete="new-password" /></Form.Item>
                  <Form.Item label="确认密码" name="password_confirm" rules={[{ required: true, message: "请再次填写密码" }]}><Input.Password autoComplete="new-password" /></Form.Item>
                  {error && <Typography.Paragraph type="danger">{error}</Typography.Paragraph>}
                  <Button type="primary" htmlType="submit" loading={submitting} block>创建管理员</Button>
                </Form>
              )}
            </Card>
          </main>
        )}
      </AntApp>
    </ConfigProvider>
  );
}
