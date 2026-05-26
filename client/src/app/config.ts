export const appMode = import.meta.env.VITE_APP_MODE === "public" ? "public" : "author";
export const isPublicApp = appMode === "public";
export const bootstrapPath = import.meta.env.VITE_BOOTSTRAP_PATH || "/api/graph/bootstrap";
