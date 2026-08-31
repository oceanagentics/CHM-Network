import cors from "cors";
import express, { type Request, type RequestHandler, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { GraphBootstrapPayload, NodeReviewInput, RyuSystemQuery } from "../../shared/domain";
import type { GraphRepository } from "./graphRepository";
import { isRecord, isReviewState, normalizeString } from "./graphRepositorySupport";
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

function readNodeReviewInput(input: unknown): NodeReviewInput {
  if (!isRecord(input)) {
    throw new Error("review body is required");
  }

  const allowedFields = new Set(["reviewState", "reviewerNote"]);
  const unsupportedFields = Object.keys(input).filter((key) => !allowedFields.has(key));
  if (unsupportedFields.length > 0) {
    throw new Error(`unsupported review fields: ${unsupportedFields.join(", ")}`);
  }

  const hasReviewState = Object.prototype.hasOwnProperty.call(input, "reviewState");
  const hasReviewerNote = Object.prototype.hasOwnProperty.call(input, "reviewerNote");
  if (!hasReviewState && !hasReviewerNote) {
    throw new Error("reviewState or reviewerNote is required");
  }
  if (hasReviewState && !isReviewState(input.reviewState)) {
    throw new Error("invalid reviewState");
  }
  if (
    hasReviewerNote &&
    input.reviewerNote !== null &&
    typeof input.reviewerNote !== "string"
  ) {
    throw new Error("reviewerNote must be a string or null");
  }

  return {
    ...(hasReviewState ? { reviewState: input.reviewState as NodeReviewInput["reviewState"] } : {}),
    ...(hasReviewerNote ? { reviewerNote: normalizeString(input.reviewerNote) } : {}),
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

export function toPublicBootstrap(payload: GraphBootstrapPayload): GraphBootstrapPayload {
  return {
    ...payload,
    nodes: payload.nodes.map((node) => ({
      ...node,
      reviewerNote: null,
      reviewer: null,
      lastReviewed: null,
      review: {},
    })),
    sources: payload.sources.map((source) => ({
      ...source,
      localPath: null,
    })),
  };
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
  const iapAudience = process.env.IAP_JWT_AUDIENCE;
  const shouldRedactBootstrap = mode === "public" && !iapAudience;

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
  app.use(requireIap(iapAudience));

  router.get("/api/health", sendHealth);
  router.get("/health", sendHealth);
  router.get("/healthz", sendHealth);

  router.get("/api/graph/bootstrap", async (_request, response) => {
    const bootstrap = await repository.getBootstrap();
    response.json(shouldRedactBootstrap ? toPublicBootstrap(bootstrap) : bootstrap);
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

  router.patch("/api/nodes/:id/review", writeAccess, async (request, response) => {
    const reviewer = readAuditUser(request).email;
    if (!reviewer) {
      return response.status(401).json({ error: "missing_chm_user_email" });
    }

    try {
      const node = await repository.updateNodeReview(
        readParam(request, "id"),
        readNodeReviewInput(request.body),
        reviewer,
      );
      logWrite(request, "update_node_review");
      response.json(node);
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
