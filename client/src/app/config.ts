export const appMode = import.meta.env.VITE_APP_MODE === "public" ? "public" : "author";
export const isPublicApp = appMode === "public";
export const canReviewNodes = import.meta.env.VITE_CAN_REVIEW_NODES === "false"
  ? false
  : !isPublicApp;

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === "/") {
    return "";
  }

  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

export const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);
export const adminAppBasePath = normalizeBasePath(
  import.meta.env.VITE_ADMIN_BASE_PATH ?? "/explorer/admin",
);
const reviewApiBasePath = normalizeBasePath(
  import.meta.env.VITE_REVIEW_API_BASE_PATH ?? "/api/explorer",
);

export function appPath(path: string): string {
  return `${appBasePath}/${path.replace(/^\/+/, "")}`;
}

export function reviewApiPath(path: string): string {
  return `${reviewApiBasePath}/${path.replace(/^\/+/, "")}`;
}

export const bootstrapPath = import.meta.env.VITE_BOOTSTRAP_PATH || appPath("/api/graph/bootstrap");
