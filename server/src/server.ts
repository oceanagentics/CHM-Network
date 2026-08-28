import cors from "cors";
import express, { type Request, type RequestHandler, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  GraphEdgeInput,
  GraphNodeInput,
  RyuSystemQuery,
  SavedViewInput,
  SourceInput,
} from "../../shared/domain";
import type { GraphRepository } from "./graphRepository";
import { createGraphRepository } from "./repositoryFactory";

export type RyuRuntimeMode = "local" | "public" | "api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const defaultDistDirectory = path.join(repoRoot, "client", "dist");
const fallbackPublicDirectory = path.join(repoRoot, "client", "public");
const iapHeader = "x-goog-iap-jwt-assertion";
const iapIssuer = "https://cloud.google.com/iap";
const oceanAgenticsDomain = "oceanagentics.com";
const iapClient = new OAuth2Client();

let cachedIapKeys: { pubkeys: Record<string, string>; expiresAt: number } | null = null;

async function getIapPublicKeys(): Promise<Record<string, string>> {
  const now = Date.now();
  if (!cachedIapKeys || cachedIapKeys.expiresAt <= now) {
    const response = await iapClient.getIapPublicKeys();
    cachedIapKeys = {
      pubkeys: response.pubkeys,
      expiresAt: now + 5 * 60 * 1000,
    };
  }

  return cachedIapKeys.pubkeys;
}

async function validateIapAssertion(assertion: string, expectedAudience: string) {
  const pubkeys = await getIapPublicKeys();
  const ticket = await iapClient.verifySignedJwtWithCertsAsync(
    assertion,
    pubkeys,
    expectedAudience,
    [iapIssuer],
  );

  return ticket.getPayload();
}

function isOceanAgenticsIapPayload(payload: Awaited<ReturnType<typeof validateIapAssertion>>): boolean {
  const email = typeof payload?.email === "string" ? payload.email.toLowerCase() : "";
  const hostedDomain = typeof payload?.hd === "string" ? payload.hd.toLowerCase() : "";
  const subject = typeof payload?.sub === "string" ? payload.sub : "";

  return Boolean(
    subject &&
    hostedDomain === oceanAgenticsDomain &&
    email.endsWith(`@${oceanAgenticsDomain}`),
  );
}

function readStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.flatMap((item) => readStringList(item) ?? []);
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (value === "true" || value === true) {
    return true;
  }
  if (value === "false" || value === false) {
    return false;
  }

  return undefined;
}

function readSystemQuery(input: Record<string, unknown>): RyuSystemQuery {
  return {
    query: typeof input.query === "string" ? input.query : undefined,
    domains: readStringList(input.domains),
    geographies: readStringList(input.geographies),
    capabilities: readStringList(input.capabilities),
    deliveryFormats: readStringList(input.deliveryFormats),
    routeStatus: readStringList(input.routeStatus),
    includeRoutes: readBoolean(input.includeRoutes),
    includeSources: readBoolean(input.includeSources),
  };
}

function sendError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "request failed";
  const status = message.includes("not found") ? 404 : 400;
  response.status(status).json({ error: message });
}

function sendHealth(_request: Request, response: Response) {
  response.json({ ok: true });
}

function readParam(request: Request, key: string): string {
  const value = request.params[key];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeBasePath(value: string | undefined): string {
  const trimmed = (value ?? "/").trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function readRuntimeMode(value: string | undefined): RyuRuntimeMode {
  if (value === "api" || value === "public" || value === "local") {
    return value;
  }

  return process.env.NODE_ENV === "production" ? "public" : "local";
}

function readEnvList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function readAuditUser(request: Request) {
  const email =
    request.get("x-chm-user-email") ??
    request.get("x-goog-authenticated-user-email") ??
    null;
  const subject =
    request.get("x-chm-user-subject") ??
    request.get("x-goog-authenticated-user-id") ??
    null;

  return {
    email: email?.replace(/^accounts\.google\.com:/, "") ?? null,
    subject: subject?.replace(/^accounts\.google\.com:/, "") ?? null,
  };
}

function logWrite(request: Request, action: string) {
  const auditUser = readAuditUser(request);
  console.info("Explorer write", {
    action,
    caller: request.get("x-chm-caller-service-account") ?? null,
    userEmail: auditUser.email,
    userSubject: auditUser.subject,
  });
}

function requireWriteAccess(
  mode: RyuRuntimeMode,
  trustedCallerServiceAccounts: string[],
): RequestHandler {
  return (request, response, next) => {
    if (mode === "local") {
      return next();
    }

    if (mode === "public") {
      return response.status(403).json({ error: "writes_disabled" });
    }

    const caller = request.get("x-chm-caller-service-account")?.toLowerCase() ?? "";
    if (
      trustedCallerServiceAccounts.length > 0 &&
      !trustedCallerServiceAccounts.includes(caller)
    ) {
      return response.status(403).json({ error: "unauthorized_service_account" });
    }

    const auditUser = readAuditUser(request);
    if (!auditUser.email && !auditUser.subject) {
      return response.status(401).json({ error: "missing_chm_user_context" });
    }

    return next();
  };
}

function requireIap(expectedAudience: string | undefined): RequestHandler {
  return async (request, response, next) => {
    if (!expectedAudience || request.path === "/healthz") {
      return next();
    }

    const assertion = request.get(iapHeader);
    if (!assertion) {
      return response.status(401).json({ error: "missing_iap_assertion" });
    }

    try {
      const payload = await validateIapAssertion(assertion, expectedAudience);
      if (!isOceanAgenticsIapPayload(payload)) {
        return response.status(403).json({ error: "forbidden" });
      }

      return next();
    } catch (error) {
      console.warn("Explorer IAP JWT validation failed", {
        message: error instanceof Error ? error.message : "unknown error",
      });
      return response.status(401).json({ error: "invalid_iap_assertion" });
    }
  };
}

function resolveStaticDirectory(staticDirectory?: string): string {
  if (staticDirectory) {
    return path.resolve(staticDirectory);
  }

  return fs.existsSync(defaultDistDirectory) ? defaultDistDirectory : fallbackPublicDirectory;
}

export interface CreateAppOptions {
  basePath?: string;
  mode?: RyuRuntimeMode;
  repository?: GraphRepository;
  staticDirectory?: string;
  trustedCallerServiceAccounts?: string[];
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const router = express.Router();
  const basePath = normalizeBasePath(options.basePath ?? process.env.APP_BASE_PATH);
  const mode = options.mode ?? readRuntimeMode(process.env.RYU_MODE);
  const repository = options.repository ?? createGraphRepository();
  const trustedCallerServiceAccounts =
    options.trustedCallerServiceAccounts ??
    readEnvList(process.env.RYU_TRUSTED_CALLER_SERVICE_ACCOUNTS);
  const staticDirectory = resolveStaticDirectory(options.staticDirectory ?? process.env.RYU_STATIC_DIR);
  const indexPath = path.join(staticDirectory, "index.html");
  const writeAccess = requireWriteAccess(mode, trustedCallerServiceAccounts);

  app.disable("x-powered-by");
  app.set("trust proxy", true);

  if (mode === "local") {
    app.use(
      cors({
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      }),
    );
  }

  app.use(express.json());
  app.get("/healthz", sendHealth);
  app.use(requireIap(process.env.IAP_JWT_AUDIENCE));

  router.get("/api/health", sendHealth);
  router.get("/health", sendHealth);
  router.get("/healthz", sendHealth);

  router.get("/api/graph/bootstrap", async (_request, response) => {
    response.json(await repository.getBootstrap());
  });

  router.get("/api/ryu/systems", async (request, response) => {
    response.json(await repository.listPortalSystems(readSystemQuery(request.query)));
  });

  router.get("/api/ryu/systems/search", async (request, response) => {
    response.json(await repository.searchPortalSystems(readSystemQuery(request.query)));
  });

  router.post("/api/ryu/systems/search", async (request, response) => {
    response.json(await repository.searchPortalSystems(readSystemQuery(request.body)));
  });

  router.get("/api/ryu/systems/:id", async (request, response) => {
    try {
      response.json(await repository.getPortalSystem(
        request.params.id,
        readSystemQuery(request.query),
      ));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/api/saved-views", async (_request, response) => {
    response.json(await repository.listSavedViews());
  });

  router.post("/api/nodes", writeAccess, async (request, response) => {
    try {
      const node = await repository.createNode(request.body as GraphNodeInput);
      logWrite(request, "create_node");
      response.status(201).json(node);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put("/api/nodes/:id", writeAccess, async (request, response) => {
    try {
      const node = await repository.updateNode(readParam(request, "id"), request.body as GraphNodeInput);
      logWrite(request, "update_node");
      response.json(node);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/api/nodes/:id", writeAccess, async (request, response) => {
    try {
      await repository.deleteNode(readParam(request, "id"));
      logWrite(request, "delete_node");
      response.status(204).send();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/api/edges", writeAccess, async (request, response) => {
    try {
      const edge = await repository.createEdge(request.body as GraphEdgeInput);
      logWrite(request, "create_edge");
      response.status(201).json(edge);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put("/api/edges/:id", writeAccess, async (request, response) => {
    try {
      const edge = await repository.updateEdge(readParam(request, "id"), request.body as GraphEdgeInput);
      logWrite(request, "update_edge");
      response.json(edge);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/api/edges/:id", writeAccess, async (request, response) => {
    try {
      await repository.deleteEdge(readParam(request, "id"));
      logWrite(request, "delete_edge");
      response.status(204).send();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/api/sources/:id", async (request, response) => {
    try {
      response.json(await repository.getSource(readParam(request, "id")));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/sources/:id", (request, response) => {
    response.redirect(302, `${basePath === "/" ? "" : basePath}/api/sources/${encodeURIComponent(readParam(request, "id"))}`);
  });

  router.post("/api/sources", writeAccess, async (request, response) => {
    try {
      const source = await repository.createSource(request.body as SourceInput);
      logWrite(request, "create_source");
      response.status(201).json(source);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put("/api/sources/:id", writeAccess, async (request, response) => {
    try {
      const source = await repository.updateSource(readParam(request, "id"), request.body as SourceInput);
      logWrite(request, "update_source");
      response.json(source);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/api/sources/:id", writeAccess, async (request, response) => {
    try {
      await repository.deleteSource(readParam(request, "id"));
      logWrite(request, "delete_source");
      response.status(204).send();
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/api/saved-views", writeAccess, async (request, response) => {
    const body = request.body as Partial<SavedViewInput>;
    if (!body.name || !body.scope) {
      response.status(400).json({ error: "name and scope are required" });
      return;
    }

    const savedView = await repository.createSavedView({
      name: body.name,
      scope: body.scope,
      filter: body.filter ?? {},
      layout: body.layout ?? {},
      style: body.style ?? {},
    });

    logWrite(request, "create_saved_view");
    response.status(201).json(savedView);
  });

  router.put("/api/saved-views/:id", writeAccess, async (request, response) => {
    const body = request.body as Partial<SavedViewInput>;
    if (!body.name || !body.scope) {
      response.status(400).json({ error: "name and scope are required" });
      return;
    }

    try {
      const savedView = await repository.updateSavedView(readParam(request, "id"), {
        name: body.name,
        scope: body.scope,
        filter: body.filter ?? {},
        layout: body.layout ?? {},
        style: body.style ?? {},
      });
      logWrite(request, "update_saved_view");
      response.json(savedView);
    } catch (error) {
      response.status(404).json({
        error: error instanceof Error ? error.message : "saved view not found",
      });
    }
  });

  router.delete("/api/saved-views/:id", writeAccess, async (request, response) => {
    await repository.deleteSavedView(readParam(request, "id"));
    logWrite(request, "delete_saved_view");
    response.status(204).send();
  });

  router.use(express.static(staticDirectory));
  if (fs.existsSync(indexPath)) {
    router.get("*", (_request, response) => {
      response.sendFile(indexPath);
    });
  }

  app.use(basePath, router);

  if (basePath !== "/") {
    app.get("/", (_request, response) => {
      response.redirect(302, basePath);
    });
  }

  app.use((request, response) => {
    response.status(404).json({
      error: "not_found",
      path: request.path,
    });
  });

  return app;
}

export interface StartOptions extends CreateAppOptions {
  host?: string;
  port?: number;
}

export function start(options: StartOptions = {}) {
  const port = options.port ?? Number.parseInt(process.env.PORT || "8787", 10);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const app = createApp(options);

  return app.listen(port, host, () => {
    console.log(`Explorer API listening on http://${host}:${port}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start();
}
