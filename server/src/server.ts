import cors from "cors";
import express, { type Request, type RequestHandler, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  GraphBootstrapPayload,
  NodeLocalizationReviewInput,
  RyuSystemQuery,
  RyuSystemRecord,
  Source,
} from "../../shared/domain";
import { defaultLocale, isSupportedLocale } from "../../shared/localization";
import type { RecordDtoScope, RecordValidationResult } from "../../shared/recordApi";
import type { GraphRepository } from "./graphRepository";
import { isRecord, isReviewState, normalizeString } from "./graphRepositorySupport";
import {
  ApiRequestError,
  hashJson,
  readBulkRecordValidationInput,
  readRecordAggregateContentInput,
  readRecordPatchInput,
  readRecordReviewInput,
  readRecordSearchQuery,
  readValidateOnly,
  toDefaultRecordDetailDto,
  toNodeLocalizationReviewInput,
  toRecordDetailDto,
  toRecordListDto,
} from "./recordContracts";
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

function readNodeReviewInput(input: unknown): NodeLocalizationReviewInput {
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
    ...(hasReviewState ? { reviewState: input.reviewState as NodeLocalizationReviewInput["reviewState"] } : {}),
    ...(hasReviewerNote ? { reviewerNote: normalizeString(input.reviewerNote) } : {}),
  };
}

function sendError(response: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "request failed";
  const status =
    error instanceof ApiRequestError
      ? error.status
      : message.includes("not found")
        ? 404
        : 400;
  response.status(status).json({ error: message });
}

function sendHealth(_request: Request, response: Response) {
  response.json({ ok: true });
}

function withoutLocalPath<T extends { localPath: string | null }>(source: T): T {
  return {
    ...source,
    localPath: null,
  };
}

export function toPublicBootstrap(payload: GraphBootstrapPayload): GraphBootstrapPayload {
  return {
    ...payload,
    nodes: payload.nodes.map((node) => ({
      ...node,
      localizations: Object.fromEntries(
        Object.entries(node.localizations).map(([locale, localization]) => [
          locale,
          localization
            ? {
                ...localization,
                reviewerNote: null,
                reviewer: null,
                lastReviewed: null,
              }
            : localization,
        ]),
      ) as typeof node.localizations,
    })),
    sources: payload.sources.map(withoutLocalPath),
    ryuRoutes: [],
  };
}

function toPublicPortalSystem(system: RyuSystemRecord): RyuSystemRecord {
  return {
    ...system,
    routes: [],
    sources: system.sources.map(withoutLocalPath),
  };
}

function readParam(request: Request, key: string): string {
  const value = request.params[key];
  return Array.isArray(value) ? value[0] : value;
}

function readLocaleParam(request: Request, key: string) {
  const locale = readParam(request, key);
  if (!isSupportedLocale(locale)) {
    throw new Error(`unsupported locale: ${locale}`);
  }

  return locale;
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
    email: email?.replace(/^accounts\.google\.com:/, "").toLowerCase() ?? null,
    subject: subject?.replace(/^accounts\.google\.com:/, "") ?? null,
  };
}

function logWrite(request: Request, action: string, details: Record<string, unknown> = {}) {
  const auditUser = readAuditUser(request);
  console.info("Explorer write", {
    requestId: request.get("x-request-id") ?? request.get("x-cloud-trace-context") ?? null,
    action,
    caller: request.get("x-chm-caller-service-account") ?? null,
    userEmail: auditUser.email,
    userSubject: auditUser.subject,
    ...details,
  });
}

function isOceanAgenticsEmail(email: string | null): boolean {
  return Boolean(email?.endsWith(`@${oceanAgenticsDomain}`));
}

function requireAuthenticatedEditorAccess(
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
    if (!auditUser.email) {
      return response.status(401).json({ error: "missing_chm_user_context" });
    }
    if (!isOceanAgenticsEmail(auditUser.email)) {
      return response.status(403).json({ error: "forbidden" });
    }

    return next();
  };
}

function requireAdminAccess(
  mode: RyuRuntimeMode,
  trustedCallerServiceAccounts: string[],
  adminUsers: string[],
): RequestHandler {
  const editorAccess = requireAuthenticatedEditorAccess(mode, trustedCallerServiceAccounts);
  return (request, response, next) => {
    editorAccess(request, response, () => {
      if (mode === "local") {
        return next();
      }

      if (adminUsers.length === 0) {
        return response.status(403).json({ error: "admin_allowlist_missing" });
      }

      const auditUser = readAuditUser(request);
      if (!auditUser.email || !adminUsers.includes(auditUser.email)) {
        return response.status(403).json({ error: "admin_required" });
      }

      return next();
    });
  };
}

function requirePrivateRecordReadAccess(
  mode: RyuRuntimeMode,
  trustedCallerServiceAccounts: string[],
): RequestHandler {
  return (request, response, next) => {
    if (mode !== "api") {
      return next();
    }

    const caller = request.get("x-chm-caller-service-account")?.toLowerCase() ?? "";
    if (
      trustedCallerServiceAccounts.length > 0 &&
      !trustedCallerServiceAccounts.includes(caller)
    ) {
      return response.status(403).json({ error: "unauthorized_service_account" });
    }

    const auditUser = readAuditUser(request);
    if (!auditUser.email) {
      return response.status(401).json({ error: "missing_chm_user_context" });
    }
    if (!isOceanAgenticsEmail(auditUser.email)) {
      return response.status(403).json({ error: "forbidden" });
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
  adminUsers?: string[];
  staticDirectory?: string;
  trustedCallerServiceAccounts?: string[];
}

function readRecordDtoScope(mode: RyuRuntimeMode, iapAudience: string | undefined): RecordDtoScope {
  if (mode === "api" || mode === "local") {
    return "private";
  }

  return iapAudience ? "admin" : "public";
}

function isRecordValidationResult(value: unknown): value is RecordValidationResult {
  return isRecord(value) && typeof value.valid === "boolean" && Array.isArray(value.issues);
}

function readQueryString(request: Request, key: string): string | null {
  const value = request.query[key];
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonBody(limit: string): RequestHandler {
  return express.json({ limit });
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
  const adminUsers = options.adminUsers ?? readEnvList(process.env.EXPLORER_ADMIN_USERS);
  const staticDirectory = resolveStaticDirectory(options.staticDirectory ?? process.env.RYU_STATIC_DIR);
  const indexPath = path.join(staticDirectory, "index.html");
  const editorAccess = requireAuthenticatedEditorAccess(mode, trustedCallerServiceAccounts);
  const adminAccess = requireAdminAccess(mode, trustedCallerServiceAccounts, adminUsers);
  const privateRecordReadAccess = requirePrivateRecordReadAccess(mode, trustedCallerServiceAccounts);
  const iapAudience = process.env.IAP_JWT_AUDIENCE;
  const shouldRedactPublicFields = mode === "public" && !iapAudience;
  const recordDtoScope = readRecordDtoScope(mode, iapAudience);

  app.disable("x-powered-by");
  app.set("trust proxy", true);

  if (mode === "local") {
    app.use(
      cors({
        origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      }),
    );
  }

  app.get("/healthz", sendHealth);
  app.use(requireIap(iapAudience));

  router.get("/api/health", sendHealth);
  router.get("/health", sendHealth);
  router.get("/healthz", sendHealth);

  router.get("/api/graph/bootstrap", async (_request, response) => {
    const bootstrap = await repository.getBootstrap();
    response.json(shouldRedactPublicFields ? toPublicBootstrap(bootstrap) : bootstrap);
  });

  router.get("/api/ryu/systems", async (request, response) => {
    const systems = await repository.listPortalSystems(readSystemQuery(request.query));
    response.json(shouldRedactPublicFields ? systems.map(toPublicPortalSystem) : systems);
  });

  router.get("/api/ryu/systems/search", async (request, response) => {
    const systems = await repository.searchPortalSystems(readSystemQuery(request.query));
    response.json(shouldRedactPublicFields ? systems.map(toPublicPortalSystem) : systems);
  });

  router.post("/api/ryu/systems/search", jsonBody("64kb"), async (request, response) => {
    const systems = await repository.searchPortalSystems(readSystemQuery(request.body));
    response.json(shouldRedactPublicFields ? systems.map(toPublicPortalSystem) : systems);
  });

  router.get("/api/records", privateRecordReadAccess, async (request, response) => {
    try {
      const query = readRecordSearchQuery(request.query);
      const result = await repository.listRecords(query);
      response.json(
        toRecordListDto(result.records, result.nextCursor, recordDtoScope, query.include, query.locale),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/api/records/:id", privateRecordReadAccess, async (request, response) => {
    try {
      const query = readRecordSearchQuery(request.query);
      const record = await repository.getRecord(readParam(request, "id"), query);
      response.json(toDefaultRecordDetailDto(record, recordDtoScope, query.include, query.locale));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put("/api/records/:id", editorAccess, jsonBody("1mb"), async (request, response) => {
    const id = readParam(request, "id");
    try {
      const validateOnly = readValidateOnly(request.query.validateOnly);
      const input = readRecordAggregateContentInput(id, request.body);
      const result = await repository.upsertRecord(id, input, { validateOnly });
      logWrite(request, "upsert_record", {
        targetRecordId: id,
        validateOnly,
        validationResult: isRecordValidationResult(result) ? result.valid : true,
        afterHash: isRecordValidationResult(result) ? null : hashJson(result),
      });
      response.json(
        isRecordValidationResult(result)
          ? result
          : toDefaultRecordDetailDto(result, recordDtoScope, [], defaultLocale),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch("/api/records/:id", editorAccess, jsonBody("256kb"), async (request, response) => {
    const id = readParam(request, "id");
    try {
      const validateOnly = readValidateOnly(request.query.validateOnly);
      const input = readRecordPatchInput(id, request.body);
      const result = await repository.patchRecord(id, input, { validateOnly });
      logWrite(request, "patch_record", {
        targetRecordId: id,
        validateOnly,
        affectedSections: Object.keys(input),
        validationResult: isRecordValidationResult(result) ? result.valid : true,
        afterHash: isRecordValidationResult(result) ? null : hashJson(result),
      });
      response.json(
        isRecordValidationResult(result)
          ? result
          : toDefaultRecordDetailDto(result, recordDtoScope, [], defaultLocale),
      );
    } catch (error) {
      sendError(response, error);
    }
  });

  router.patch("/api/records/:id/review", editorAccess, jsonBody("8kb"), async (request, response) => {
    const id = readParam(request, "id");
    try {
      const input = readRecordReviewInput(request.body);
      const reviewer = readAuditUser(request).email;
      if (!reviewer) {
        return response.status(401).json({ error: "missing_chm_user_context" });
      }

      await repository.updateNodeLocalizationReview(
        id,
        input.locale,
        toNodeLocalizationReviewInput(input),
        reviewer,
      );
      const query = readRecordSearchQuery({
        locale: input.locale,
        include: "localizations,edges,sources,routes",
      });
      const record = await repository.getRecord(id, query);
      logWrite(request, "update_record_review", {
        targetRecordId: id,
        locale: input.locale,
        validationResult: true,
        afterHash: hashJson(record),
      });
      response.json(toDefaultRecordDetailDto(record, recordDtoScope, query.include, input.locale));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.delete("/api/records/:id", adminAccess, async (request, response) => {
    const id = readParam(request, "id");
    try {
      const validateOnly = readValidateOnly(request.query.validateOnly);
      const impactHash = readQueryString(request, "impactHash");
      if (!validateOnly && !impactHash) {
        throw new ApiRequestError(400, "impactHash is required");
      }
      const impact = validateOnly
        ? await repository.getRecordDeleteImpact(id)
        : await repository.deleteRecord(id, impactHash ?? "");
      logWrite(request, "delete_record", {
        targetRecordId: id,
        validateOnly,
        validationResult: true,
        beforeHash: impact.impactHash,
      });
      response.json(impact);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/api/records:bulk", adminAccess, jsonBody("2mb"), async (request, response) => {
    try {
      const input = readBulkRecordValidationInput(request.body);
      const result = await repository.validateBulkRecords(input);
      logWrite(request, "validate_records_bulk", {
        validateOnly: true,
        validationResult: result.valid,
        checkedRecords: result.checkedRecords,
      });
      response.json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/api/ryu/systems/:id", async (request, response) => {
    try {
      const system = await repository.getPortalSystem(
        request.params.id,
        readSystemQuery(request.query),
      );
      response.json(shouldRedactPublicFields ? toPublicPortalSystem(system) : system);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/api/saved-views", async (_request, response) => {
    response.json(await repository.listSavedViews());
  });

  router.patch("/api/nodes/:id/localizations/:locale/review", editorAccess, jsonBody("8kb"), async (request, response) => {
    const reviewer = readAuditUser(request).email;
    if (!reviewer) {
      return response.status(401).json({ error: "missing_chm_user_context" });
    }

    try {
      const node = await repository.updateNodeLocalizationReview(
        readParam(request, "id"),
        readLocaleParam(request, "locale"),
        readNodeReviewInput(request.body),
        reviewer,
      );
      logWrite(request, "update_node_localization_review");
      response.json(node);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/api/sources/:id", async (request, response) => {
    try {
      const source = await repository.getSource(readParam(request, "id"));
      response.json(shouldRedactPublicFields ? withoutLocalPath<Source>(source) : source);
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

  app.use((error: unknown, _request: Request, response: Response, next: express.NextFunction) => {
    if (response.headersSent) {
      return next(error);
    }
    if (isRecord(error) && error.type === "entity.too.large") {
      return response.status(413).json({ error: "payload_too_large" });
    }
    if (error instanceof SyntaxError) {
      return response.status(400).json({ error: "invalid_json" });
    }

    return next(error);
  });

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
