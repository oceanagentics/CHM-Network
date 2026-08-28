export const appMode = import.meta.env.VITE_APP_MODE === "public" ? "public" : "author";
export const isPublicApp = appMode === "public";

function normalizeBasePath(value: string | undefined): string {
  if (!value || value === "/") {
    return "";
  }

  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

export const appBasePath = normalizeBasePath(import.meta.env.BASE_URL);

export function appPath(path: string): string {
  return `${appBasePath}/${path.replace(/^\/+/, "")}`;
}

export const bootstrapPath = import.meta.env.VITE_BOOTSTRAP_PATH || appPath("/api/graph/bootstrap");
