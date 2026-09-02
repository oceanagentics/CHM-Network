import cors from "cors";
import express, { type Request, type RequestHandler, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  GraphBootstrapPayload,
} from "../../shared/domain";
import { defaultLocale } from "../../shared/localization";
import type { RecordDtoScope, RecordValidationResult } from "../../shared/recordApi";
import type { GraphRepository } from "./graphRepository";
import { isRecord, normalizeString } from "./graphRepositorySupport";
import {
  ApiRequestError,
  buildRecordUpdatedAt,
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

export type ApiTokenScope = "reader" | "writer" | "reviewer" | "admin";

export interface ApiTokenRecord {
  name: string;
  scopes: ApiTokenScope[];
  hash: string;
  owner?: string | null;
  expiresAt?: string | null;
}

type AuthContext = {
  kind: "local" | "public" | "iap" | "token";
  scopes: ApiTokenScope[];
  tokenName?: string;
  tokenOwner?: string | null;
  userEmail?: string | null;
  userSubject?: string | null;
  rateLimitBucket?: string | null;
};

const scopeRank: Record<ApiTokenScope, number> = {
  reader: 0,
  writer: 1,
  reviewer: 2,
  admin: 3,
};

const tokenScopes = new Set<ApiTokenScope>(["reader", "writer", "reviewer", "admin"]);
const recordUpdatedAtHeader = "x-ryu-record-updated-at";
const createOnlyHeader = "x-ryu-create-only";

export function hashApiToken(token: string): string {
  return `sha256:${crypto.createHash("sha256").update(token).digest("hex")}`;
}

function isApiTokenScope(value: unknown): value is ApiTokenScope {
  return typeof value === "string" && tokenScopes.has(value as ApiTokenScope);
}

function hasScope(scopes: ApiTokenScope[], requiredScope: ApiTokenScope): boolean {
  return scopes.some((scope) => scopeRank[scope] >= scopeRank[requiredScope]);
}

function readApiTokenRecords(value: string | undefined): ApiTokenRecord[] {
  if (!value?.trim()) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("RYU_API_TOKENS_JSON must be a JSON array");
  }

  return parsed.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`RYU_API_TOKENS_JSON[${index}] must be an object`);
    }
    if (typeof item.name !== "string" || !item.name.trim()) {
      throw new Error(`RYU_API_TOKENS_JSON[${index}].name is required`);
    }
    if (typeof item.hash !== "string" || !item.hash.startsWith("sha256:")) {
      throw new Error(`RYU_API_TOKENS_JSON[${index}].hash must be sha256:<hex>`);
    }
    if (!Array.isArray(item.scopes) || !item.scopes.every(isApiTokenScope)) {
      throw new Error(`RYU_API_TOKENS_JSON[${index}].scopes are invalid`);
    }
    if (
      item.expiresAt !== undefined &&
      item.expiresAt !== null &&
      typeof item.expiresAt !== "string"
    ) {
      throw new Error(`RYU_API_TOKENS_JSON[${index}].expiresAt must be a string or null`);
    }

    return {
      name: item.name.trim(),
      hash: item.hash,
      scopes: item.scopes,
      owner: typeof item.owner === "string" ? item.owner : null,
      expiresAt: item.expiresAt ?? null,
    };
  });
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function authenticateToken(request: Request, tokens: ApiTokenRecord[]): AuthContext | ApiRequestError {
  if (tokens.length === 0) {
    return new ApiRequestError(403, "api_token_config_missing");
  }

  const authorization = request.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return new ApiRequestError(401, "missing_bearer_token");
  }

  const hashedToken = hashApiToken(match[1]);
  const token = tokens.find((candidate) => safeEqual(candidate.hash, hashedToken));
  if (!token) {
    return new ApiRequestError(403, "invalid_bearer_token");
  }
  if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) {
    return new ApiRequestError(403, "expired_bearer_token");
  }

  return {
    kind: "token",
    scopes: token.scopes,
    tokenName: token.name,
    tokenOwner: token.owner ?? null,
    rateLimitBucket: token.name,
  };
}

function createTokenRateLimiter(limitPerMinute: number) {
  const windowMs = 60_000;
  const buckets = new Map<string, { startedAt: number; count: number }>();

  return (context: AuthContext, response: Response): boolean => {
    if (context.kind !== "token" || !context.rateLimitBucket) {
      return true;
    }

    const now = Date.now();
    const bucket = buckets.get(context.rateLimitBucket);
    const current = bucket && now - bucket.startedAt < windowMs
      ? bucket
      : { startedAt: now, count: 0 };

    if (current.count >= limitPerMinute) {
      response.set("Retry-After", String(Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000))));
      return false;
    }

    current.count += 1;
    buckets.set(context.rateLimitBucket, current);
    return true;
  };
}

function setAuthContext(response: Response, context: AuthContext) {
  response.locals.ryuAuth = context;
}

function readAuthContext(response: Response): AuthContext | null {
  return response.locals.ryuAuth as AuthContext | null ?? null;
}

function readAuditUser(request: Request, response?: Response) {
  const context = response ? readAuthContext(response) : null;
  if (context?.userEmail || context?.userSubject) {
    return {
      email: context.userEmail ?? null,
      subject: context.userSubject ?? null,
    };
  }
  const iapUser = response?.locals.ryuIapUser as { email?: string | null; subject?: string | null } | undefined;
  if (iapUser?.email || iapUser?.subject) {
    return {
      email: iapUser.email ?? null,
      subject: iapUser.subject ?? null,
    };
  }

  const email =
    request.get("x-goog-authenticated-user-email") ??
    null;
  const subject =
    request.get("x-goog-authenticated-user-id") ??
    null;

  return {
    email: email?.replace(/^accounts\.google\.com:/, "").toLowerCase() ?? null,
    subject: subject?.replace(/^accounts\.google\.com:/, "") ?? null,
  };
}

function logWrite(
  request: Request,
  response: Response,
  action: string,
  details: Record<string, unknown> = {},
) {
  const auth = readAuthContext(response);
  const auditUser = readAuditUser(request, response);
  console.info("Explorer write", {
    requestId: request.get("x-request-id") ?? request.get("x-cloud-trace-context") ?? null,
    action,
    authKind: auth?.kind ?? null,
    tokenName: auth?.tokenName ?? null,
    tokenOwner: auth?.tokenOwner ?? null,
    tokenScopes: auth?.kind === "token" ? auth.scopes : undefined,
    rateLimitBucket: auth?.rateLimitBucket ?? null,
    userEmail: auditUser.email,
    userSubject: auditUser.subject,
    method: request.method,
    route: request.route?.path ?? request.path,
    ...details,
  });
}

function isOceanAgenticsEmail(email: string | null): boolean {
  return Boolean(email?.endsWith(`@${oceanAgenticsDomain}`));
}

function requireAccess(
  mode: RyuRuntimeMode,
  requiredScope: ApiTokenScope,
  options: {
    adminUsers: string[];
    apiTokens: ApiTokenRecord[];
    iapAudience: string | undefined;
    rateLimit: ReturnType<typeof createTokenRateLimiter>;
  },
): RequestHandler {
  return (request, response, next) => {
    if (mode === "local") {
      setAuthContext(response, {
        kind: "local",
        scopes: ["admin"],
        userEmail: readAuditUser(request).email ?? "local",
        userSubject: readAuditUser(request).subject,
      });
      return next();
    }

    if (mode === "public") {
      if (requiredScope !== "reader") {
        return response.status(403).json({ error: "writes_disabled" });
      }
      setAuthContext(response, { kind: "public", scopes: ["reader"] });
      return next();
    }

    if (options.iapAudience) {
      const auditUser = readAuditUser(request, response);
      if (!auditUser.email) {
        return response.status(401).json({ error: "missing_iap_user_context" });
      }
      if (!isOceanAgenticsEmail(auditUser.email)) {
        return response.status(403).json({ error: "forbidden" });
      }

      const scopes: ApiTokenScope[] = options.adminUsers.includes(auditUser.email)
        ? ["admin"]
        : ["reviewer"];
      if (!hasScope(scopes, requiredScope)) {
        return response.status(403).json({ error: "admin_required" });
      }

      setAuthContext(response, {
        kind: "iap",
        scopes,
        userEmail: auditUser.email,
        userSubject: auditUser.subject,
      });
      return next();
    }

    const context = authenticateToken(request, options.apiTokens);
    if (context instanceof ApiRequestError) {
      return response.status(context.status).json({ error: context.message });
    }
    if (!hasScope(context.scopes, requiredScope)) {
      return response.status(403).json({ error: "wrong_scope" });
    }
    if (!options.rateLimit(context, response)) {
      setAuthContext(response, context);
      return response.status(429).json({ error: "rate_limited" });
    }

    setAuthContext(response, context);
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
      response.locals.ryuIapUser = {
        email: typeof payload?.email === "string" ? payload.email.toLowerCase() : null,
        subject: typeof payload?.sub === "string" ? payload.sub : null,
      };

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
  apiTokens?: ApiTokenRecord[];
  apiWriteRateLimitPerMinute?: number;
  staticDirectory?: string;
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

function readMutationOptions(request: Request, validateOnly = false) {
  return {
    validateOnly,
    recordUpdatedAt: normalizeString(request.get(recordUpdatedAtHeader)),
    createOnly: request.get(createOnlyHeader) === "true",
  };
}

function readReviewerIdentity(request: Request, response: Response): string | null {
  const auth = readAuthContext(response);
  if (auth?.kind === "token") {
    return auth.tokenOwner || auth.tokenName || null;
  }

  return readAuditUser(request, response).email;
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
  const adminUsers = options.adminUsers ?? readEnvList(process.env.EXPLORER_ADMIN_USERS);
  const apiTokens = options.apiTokens ?? readApiTokenRecords(process.env.RYU_API_TOKENS_JSON);
  const rateLimit = createTokenRateLimiter(
    options.apiWriteRateLimitPerMinute ??
      readPositiveInteger(
        process.env.RYU_API_TOKEN_LIMIT_PER_MINUTE ??
          process.env.RYU_API_TOKEN_WRITE_LIMIT_PER_MINUTE,
        300,
      ),
  );
  const staticDirectory = resolveStaticDirectory(options.staticDirectory ?? process.env.RYU_STATIC_DIR);
  const indexPath = path.join(staticDirectory, "index.html");
  const iapAudience = process.env.IAP_JWT_AUDIENCE;
  const accessOptions = { adminUsers, apiTokens, iapAudience, rateLimit };
  const recordReadAccess = requireAccess(mode, "reader", accessOptions);
  const writerAccess = requireAccess(mode, "writer", accessOptions);
  const adminAccess = requireAccess(mode, "admin", accessOptions);
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

  router.get("/api/graph/bootstrap", recordReadAccess, async (_request, response) => {
    const bootstrap = await repository.getBootstrap();
    response.json(shouldRedactPublicFields ? toPublicBootstrap(bootstrap) : bootstrap);
  });

  router.get("/api/records", recordReadAccess, async (request, response) => {
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

  router.get("/api/records/:id", recordReadAccess, async (request, response) => {
    try {
      const query = readRecordSearchQuery(request.query);
      const record = await repository.getRecord(readParam(request, "id"), query);
      response.json(toDefaultRecordDetailDto(record, recordDtoScope, query.include, query.locale));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.put("/api/records/:id", writerAccess, jsonBody("1mb"), async (request, response) => {
    const id = readParam(request, "id");
    try {
      const validateOnly = readValidateOnly(request.query.validateOnly);
      const input = readRecordAggregateContentInput(id, request.body);
      const result = await repository.upsertRecord(id, input, readMutationOptions(request, validateOnly));
      logWrite(request, response, "upsert_record", {
        targetRecordId: id,
        validateOnly,
        validationResult: isRecordValidationResult(result) ? result.valid : true,
        recordUpdatedAt: isRecordValidationResult(result)
          ? result.recordUpdatedAt ?? null
          : buildRecordUpdatedAt(result),
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

  router.patch("/api/records/:id", writerAccess, jsonBody("256kb"), async (request, response) => {
    const id = readParam(request, "id");
    try {
      const validateOnly = readValidateOnly(request.query.validateOnly);
      const input = readRecordPatchInput(id, request.body);
      const result = await repository.patchRecord(id, input, readMutationOptions(request, validateOnly));
      logWrite(request, response, "patch_record", {
        targetRecordId: id,
        validateOnly,
        affectedSections: Object.keys(input),
        validationResult: isRecordValidationResult(result) ? result.valid : true,
        recordUpdatedAt: isRecordValidationResult(result)
          ? result.recordUpdatedAt ?? null
          : buildRecordUpdatedAt(result),
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

  router.patch("/api/records/:id/review", writerAccess, jsonBody("8kb"), async (request, response) => {
    const id = readParam(request, "id");
    try {
      const validateOnly = readValidateOnly(request.query.validateOnly);
      const input = readRecordReviewInput(request.body);
      const auth = readAuthContext(response);
      if (input.reviewState === "human_reviewed" && !hasScope(auth?.scopes ?? [], "reviewer")) {
        return response.status(403).json({ error: "review_scope_required" });
      }

      const reviewer = readReviewerIdentity(request, response);
      if (!reviewer) {
        return response.status(401).json({ error: "missing_reviewer_identity" });
      }

      await repository.updateNodeLocalizationReview(
        id,
        input.locale,
        toNodeLocalizationReviewInput(input),
        reviewer,
        readMutationOptions(request, validateOnly),
      );
      const query = readRecordSearchQuery({
        locale: input.locale,
        include: "localizations,edges,sources,routes",
      });
      const record = await repository.getRecord(id, query);
      logWrite(request, response, "update_record_review", {
        targetRecordId: id,
        locale: input.locale,
        validateOnly,
        validationResult: true,
        recordUpdatedAt: buildRecordUpdatedAt(record),
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
        : await repository.deleteRecord(id, impactHash ?? "", readMutationOptions(request));
      logWrite(request, response, "delete_record", {
        targetRecordId: id,
        validateOnly,
        validationResult: true,
        recordUpdatedAt: impact.recordUpdatedAt,
      });
      response.json(impact);
    } catch (error) {
      sendError(response, error);
    }
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
