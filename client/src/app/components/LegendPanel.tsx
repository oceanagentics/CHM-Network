import { Card, Flex, Tag, Typography } from "antd";

const nodeItems = [
  { className: "governance", label: "country" },
  { className: "technical", label: "organization" },
  { className: "platform", label: "system" },
];

const edgeItems = [
  { className: "part-of", label: "part of" },
  { className: "operates", label: "operates" },
  { className: "publishes", label: "publishes to" },
  { className: "syncs", label: "syncs to" },
  { className: "planned", label: "planned relationships" },
];

export function LegendPanel() {
  return (
    <Card size="small" title="Legend">
      <Flex gap={24} align="flex-start" wrap>
        <Flex vertical gap={8} className="legend-column">
          <Typography.Text strong>Nodes</Typography.Text>
          {nodeItems.map((item) => (
            <Flex key={item.label} align="center" gap={8}>
              <span className={`legend-chip ${item.className}`} />
              <Typography.Text>{item.label}</Typography.Text>
            </Flex>
          ))}
        </Flex>
        <Flex vertical gap={8} className="legend-column">
          <Typography.Text strong>Edges</Typography.Text>
          {edgeItems.map((item) => (
            <Flex key={item.label} align="center" gap={8}>
              <span className={`legend-chip ${item.className}`} />
              <Typography.Text>{item.label}</Typography.Text>
            </Flex>
          ))}
        </Flex>
        <Tag bordered={false} color="default" className="legend-note">
          Relationship styles stay graph-native; this card only explains the main semantics.
        </Tag>
      </Flex>
    </Card>
  );
}
