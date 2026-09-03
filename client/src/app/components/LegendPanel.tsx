import { Card, Flex, Tag, Typography } from "antd";

import { facetLabel, t } from "../i18n";
import { useGraphStore } from "../state/graphStore";

const nodeItems = [
  { className: "governance", kind: "country" },
  { className: "technical", kind: "organization" },
  { className: "platform", kind: "system" },
];

const edgeItems = [
  { className: "hierarchy", kind: "part_of" },
  { className: "governs", kind: "governs" },
  { className: "operates", kind: "operates" },
  { className: "publishes", kind: "publishes_to" },
  { className: "syncs", kind: "syncs_to" },
];

export function LegendPanel() {
  const locale = useGraphStore((state) => state.locale);

  return (
    <Card size="small" title={t(locale, "graph.legend")}>
      <Flex gap={24} align="flex-start" wrap>
        <Flex vertical gap={8} className="legend-column">
          <Typography.Text strong>{t(locale, "graph.nodes")}</Typography.Text>
          {nodeItems.map((item) => (
            <Flex key={item.kind} align="center" gap={8}>
              <span className={`legend-chip ${item.className}`} />
              <Typography.Text>{facetLabel(locale, "nodeKind", item.kind)}</Typography.Text>
            </Flex>
          ))}
        </Flex>
        <Flex vertical gap={8} className="legend-column">
          <Typography.Text strong>{t(locale, "graph.edges")}</Typography.Text>
          {edgeItems.map((item) => (
            <Flex key={item.kind} align="center" gap={8}>
              <span className={`legend-chip ${item.className}`} />
              <Typography.Text>{facetLabel(locale, "edgeKind", item.kind)}</Typography.Text>
            </Flex>
          ))}
          <Flex align="center" gap={8}>
            <span className="legend-chip planned" />
            <Typography.Text>{t(locale, "graph.plannedRelationships")}</Typography.Text>
          </Flex>
        </Flex>
        <Tag bordered={false} color="default" className="legend-note">
          {t(locale, "graph.legendNote")}
        </Tag>
      </Flex>
    </Card>
  );
}
