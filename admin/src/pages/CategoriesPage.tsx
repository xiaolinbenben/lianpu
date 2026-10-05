import { useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import { fetchCategories, saveCategory, sourceKinds, type Category, type CategoryColumn } from "../lib/api";

const emptyColumn = (): CategoryColumn => ({ header: "", required: false, source_kind: "title", source_key: "" });

export default function CategoriesPage() {
  const { message } = App.useApp();
  const [items, setItems] = useState<Category[]>([]);
  const [current, setCurrent] = useState<Category | null>(null);

  const load = () => fetchCategories().then((result) => {
    setItems(result.data.items);
    setCurrent((previous) => result.data.items.find((item) => item.id === previous?.id) ?? result.data.items[0] ?? null);
  });

  useEffect(() => { load().catch((caught) => message.error(caught instanceof Error ? caught.message : "加载失败")); }, [message]);

  const updateColumn = (index: number, patch: Partial<CategoryColumn>) => {
    if (!current) return;
    const columns = current.columns.map((column, columnIndex) => columnIndex === index ? { ...column, ...patch } : column);
    setCurrent({ ...current, columns });
  };

  const save = async () => {
    if (!current) return;
    try {
      const result = await saveCategory(current);
      message.success("已保存");
      await load();
      setCurrent(result.data);
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : "保存失败");
    }
  };

  return (
    <div className="overview-page">
      <Typography.Title level={2}>类目模板</Typography.Title>
      <Typography.Paragraph type="secondary">导出时按这里的列取值。改完之后，以前采集成功的商品也会用新表头。</Typography.Paragraph>
      <Space wrap className="status-alert">
        <Select
          className="category-select"
          value={current?.id}
          options={items.map((item) => ({ value: item.id, label: item.name }))}
          onChange={(id) => setCurrent(items.find((item) => item.id === id) ?? null)}
        />
        <Button onClick={() => setCurrent({ id: 0, name: "", enabled: true, sort: items.length, note: "", columns: [emptyColumn()] })}>新建类目</Button>
      </Space>
      {current && (
        <Form layout="vertical">
          <Space wrap>
            <Form.Item label="名称"><Input value={current.name} onChange={(event) => setCurrent({ ...current, name: event.target.value })} /></Form.Item>
            <Form.Item label="排序"><InputNumber value={current.sort} onChange={(value) => setCurrent({ ...current, sort: value ?? 0 })} /></Form.Item>
            <Form.Item label="启用"><Switch checked={current.enabled} onChange={(enabled) => setCurrent({ ...current, enabled })} /></Form.Item>
          </Space>
          <Form.Item label="备注"><Input value={current.note} onChange={(event) => setCurrent({ ...current, note: event.target.value })} /></Form.Item>
          {current.columns.map((column, index) => (
            <Space key={index} wrap className="column-row">
              <Input placeholder="表头" value={column.header} onChange={(event) => updateColumn(index, { header: event.target.value })} />
              <Select className="source-select" value={column.source_kind} options={sourceKinds.map(([value, label]) => ({ value, label }))} onChange={(source_kind) => updateColumn(index, { source_kind })} />
              <Input placeholder="序号、规格名或固定文字" value={column.source_key} onChange={(event) => updateColumn(index, { source_key: event.target.value })} />
              <Switch checked={column.required} onChange={(required) => updateColumn(index, { required })} />
              <Button onClick={() => setCurrent({ ...current, columns: current.columns.filter((_, columnIndex) => columnIndex !== index) })}>移除</Button>
            </Space>
          ))}
          <Space className="status-alert">
            <Button onClick={() => setCurrent({ ...current, columns: [...current.columns, emptyColumn()] })}>添加列</Button>
            <Button type="primary" onClick={() => void save()}>保存类目</Button>
          </Space>
        </Form>
      )}
    </div>
  );
}
