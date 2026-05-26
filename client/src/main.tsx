import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";
import "@xyflow/react/dist/style.css";

import { App } from "./app/App";
import "./app/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ConfigProvider
    theme={{
      algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
      token: {
        borderRadius: 10,
        colorBgLayout: "#f3f7fb",
        colorBorderSecondary: "#d7e0ec",
        colorPrimary: "#2458a6",
        controlHeight: 32,
        fontSize: 13,
      },
      components: {
        Card: {
          bodyPadding: 14,
          headerHeight: 42,
        },
        Form: {
          itemMarginBottom: 10,
          labelHeight: 20,
        },
        List: {
          itemPaddingLG: "8px 0",
          itemPaddingSM: "6px 0",
        },
        Modal: {
          borderRadiusLG: 14,
        },
      },
    }}
  >
    <App />
  </ConfigProvider>,
);
