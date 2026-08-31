import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";

import { App } from "./app/App";
import { adminAppBasePath, appBasePath, isPublicApp } from "./app/config";
import "./app/styles.css";

function redirectAuthenticatedPublicUserToAdmin() {
  if (!isPublicApp) {
    return;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1500);
  fetch(`${adminAppBasePath}/api/health`, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "manual",
    signal: controller.signal,
  })
    .then((response) => {
      if (!response.ok) {
        return;
      }

      const publicBasePath = appBasePath || "/";
      const publicPath =
        window.location.pathname === publicBasePath ||
        publicBasePath === "/"
          ? ""
          : window.location.pathname.slice(publicBasePath.length);
      window.location.replace(
        `${adminAppBasePath}${publicPath}${window.location.search}${window.location.hash}`,
      );
    })
    .catch(() => undefined)
    .finally(() => window.clearTimeout(timeout));
}

redirectAuthenticatedPublicUserToAdmin();

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
