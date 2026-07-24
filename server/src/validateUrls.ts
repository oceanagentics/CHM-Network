import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { promisify } from "node:util";

import { getDatabase } from "./db";

type UrlRecord = {
  tableName: string;
  recordId: string;
  fieldName: string;
  url: string;
  description: string | null;
};

type UrlResult = {
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  reason: string | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const publicDir = path.join(repoRoot, "client", "public");
const timeoutMs = 15_000;
const sampleBytes = 64 * 1024;
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 CHM-Network-URL-Validator/1.0";
const execFileAsync = promisify(execFile);

function isLocalPublicPath(url: string): boolean {
  return url.startsWith("/");
}

function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function sourceUrlRecords(): UrlRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT id, url
        FROM sources
        WHERE url IS NOT NULL AND trim(url) <> ''
        ORDER BY id
      `,
    )
    .all() as Array<{ id: string; url: string }>;

  return rows.map((row) => ({
    tableName: "sources",
    recordId: row.id,
    fieldName: "url",
    url: row.url,
    description: null,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nodeUrlRecords(): UrlRecord[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
        SELECT id, details_json
        FROM nodes
        WHERE details_json IS NOT NULL AND trim(details_json) <> ''
        ORDER BY id
      `,
    )
    .all() as Array<{ id: string; details_json: string | null }>;

  const records: UrlRecord[] = [];
  for (const row of rows) {
    const details = row.details_json ? JSON.parse(row.details_json) as unknown : {};
    if (!isRecord(details)) {
      continue;
    }

    const accessPaths = Array.isArray(details.access) ? details.access : [];
    for (const [index, pathRecord] of accessPaths.entries()) {
      if (!isRecord(pathRecord)) {
        continue;
      }

      const url = stringField(pathRecord.url);
      if (url) {
        records.push({
          tableName: "nodes",
          recordId: row.id,
          fieldName: `details.access.${stringField(pathRecord.id) ?? index}.url`,
          url,
          description: stringField(pathRecord.description),
        });
      }
    }

    const galleryItems = Array.isArray(details.gallery) ? details.gallery : [];
    for (const [index, itemRecord] of galleryItems.entries()) {
      if (!isRecord(itemRecord)) {
        continue;
      }

      const itemId = stringField(itemRecord.id) ?? String(index);
      const url = stringField(itemRecord.url);
      if (url) {
        records.push({
          tableName: "nodes",
          recordId: row.id,
          fieldName: `details.gallery.${itemId}.url`,
          url,
          description: null,
        });
      }

      const thumbnailUrl = stringField(itemRecord.thumbnailUrl);
      if (thumbnailUrl) {
        records.push({
          tableName: "nodes",
          recordId: row.id,
          fieldName: `details.gallery.${itemId}.thumbnailUrl`,
          url: thumbnailUrl,
          description: null,
        });
      }
    }
  }

  return records;
}

function localPathResult(url: string): UrlResult {
  const publicPath = path.normalize(path.join(publicDir, url.replace(/^\/+/, "")));
  if (!publicPath.startsWith(publicDir + path.sep)) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      reason: "local public path escapes client/public",
    };
  }

  if (!fs.existsSync(publicPath)) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      reason: `local public file does not exist: ${path.relative(repoRoot, publicPath)}`,
    };
  }

  return {
    ok: true,
    status: null,
    finalUrl: publicPath,
    reason: null,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...init,
      headers: {
        "User-Agent": userAgent,
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isAllowedStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

function statusReason(status: number): string {
  if (status === 401) {
    return "unauthorized";
  }
  if (status === 403) {
    return "forbidden";
  }
  if (status === 404) {
    return "not found";
  }
  if (status >= 500) {
    return "server error";
  }
  return `unexpected HTTP status ${status}`;
}

async function readSample(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (totalBytes < sampleBytes) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }
    chunks.push(value);
    totalBytes += value.byteLength;
  }

  await reader.cancel().catch(() => undefined);

  const sample = new Uint8Array(Math.min(totalBytes, sampleBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const chunkPart = chunk.subarray(0, Math.min(chunk.byteLength, sample.length - offset));
    sample.set(chunkPart, offset);
    offset += chunkPart.byteLength;
    if (offset >= sample.length) {
      break;
    }
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(sample);
}

function challengeReason(response: Response, sample: string): string | null {
  const cfMitigated = response.headers.get("cf-mitigated");
  if (cfMitigated) {
    return `Cloudflare ${cfMitigated}`;
  }

  const normalized = sample.toLowerCase();
  const challengePatterns = [
    "just a moment...",
    "enable javascript and cookies to continue",
    "/cdn-cgi/challenge-platform/",
    "checking your browser",
    "attention required! | cloudflare",
    "cf-browser-verification",
  ];

  if (challengePatterns.some((pattern) => normalized.includes(pattern))) {
    return "bot or JavaScript challenge page";
  }

  const hardFailurePatterns = [
    "404 not found",
    "403 forbidden",
    "access denied",
    "page not found",
  ];

  if (hardFailurePatterns.some((pattern) => normalized.includes(pattern))) {
    return "HTML error page";
  }

  return null;
}

async function validateHttpUrl(url: string): Promise<UrlResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { method: "HEAD" });
  } catch (error) {
    return validateHttpUrlWithCurl(
      url,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 405 ||
    response.status === 501
  ) {
    return validateHttpUrlWithGet(url);
  }

  if (!isAllowedStatus(response.status)) {
    return {
      ok: false,
      status: response.status,
      finalUrl: response.url,
      reason: statusReason(response.status),
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url,
      reason: null,
    };
  }

  return validateHttpUrlWithGet(url);
}

async function validateHttpUrlWithGet(url: string): Promise<UrlResult> {
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Range: `bytes=0-${sampleBytes - 1}`,
      },
    });
  } catch (error) {
    return validateHttpUrlWithCurl(
      url,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!isAllowedStatus(response.status)) {
    return {
      ok: false,
      status: response.status,
      finalUrl: response.url,
      reason: statusReason(response.status),
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    const sample = await readSample(response);
    const challenge = challengeReason(response, sample);
    if (challenge) {
      return {
        ok: false,
        status: response.status,
        finalUrl: response.url,
        reason: challenge,
      };
    }
  }

  return {
    ok: true,
    status: response.status,
    finalUrl: response.url,
    reason: null,
  };
}

async function validateHttpUrlWithCurl(
  url: string,
  fetchFailureReason: string,
): Promise<UrlResult> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-sS",
        "-L",
        "-A",
        userAgent,
        "--max-time",
        String(Math.ceil(timeoutMs / 1000)),
        "--range",
        `0-${sampleBytes - 1}`,
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}\t%{url_effective}",
        url,
      ],
      { maxBuffer: 1024 * 1024 },
    );
    const [statusText, finalUrl] = stdout.trim().split("\t");
    const status = Number(statusText);

    if (!Number.isFinite(status) || status === 0) {
      return {
        ok: false,
        status: null,
        finalUrl: finalUrl || null,
        reason: fetchFailureReason,
      };
    }

    if (!isAllowedStatus(status)) {
      return {
        ok: false,
        status,
        finalUrl: finalUrl || url,
        reason: statusReason(status),
      };
    }

    return {
      ok: true,
      status,
      finalUrl: finalUrl || url,
      reason: null,
    };
  } catch (error) {
    const curlReason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: null,
      finalUrl: null,
      reason: `${fetchFailureReason}; curl fallback failed: ${curlReason}`,
    };
  }
}

async function validateUrl(url: string): Promise<UrlResult> {
  if (isLocalPublicPath(url)) {
    return localPathResult(url);
  }

  if (!isHttpUrl(url)) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      reason: "URL is not http(s) or a local public path",
    };
  }

  return validateHttpUrl(url);
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function formatFailure(records: UrlRecord[], result: UrlResult): string {
  const locations = records
    .map((record) => {
      const descriptionHint = record.description
        ? `\n    description: ${record.description}`
        : "";
      return `  ${record.tableName}.${record.recordId}.${record.fieldName}${descriptionHint}`;
    })
    .join("\n");

  const status = result.status === null ? "n/a" : String(result.status);
  const finalUrl = result.finalUrl && result.finalUrl !== records[0].url
    ? `\n  final: ${result.finalUrl}`
    : "";
  return `${locations}\n  url: ${records[0].url}${finalUrl}\n  status: ${status}\n  reason: ${result.reason ?? "unknown failure"}`;
}

async function main() {
  const records = [
    ...sourceUrlRecords(),
    ...nodeUrlRecords(),
  ];
  const recordsByUrl = new Map<string, UrlRecord[]>();

  for (const record of records) {
    const normalizedUrl = record.url.trim();
    const existingRecords = recordsByUrl.get(normalizedUrl) ?? [];
    existingRecords.push({ ...record, url: normalizedUrl });
    recordsByUrl.set(normalizedUrl, existingRecords);
  }

  const uniqueUrls = [...recordsByUrl.keys()];
  const results = await mapWithConcurrency(uniqueUrls, 8, async (url) => ({
    url,
    result: await validateUrl(url),
  }));
  const failures = results.filter(({ result }) => !result.ok);

  if (failures.length > 0) {
    console.error(
      [
        "URL validation failed",
        "",
        `Checked ${uniqueUrls.length.toLocaleString()} unique URLs from ${records.length.toLocaleString()} URL fields.`,
        `Failures: ${failures.length.toLocaleString()}`,
        "",
        ...failures.map(({ url, result }) =>
          formatFailure(recordsByUrl.get(url) ?? [], result),
        ),
      ].join("\n\n"),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `URL validation passed: checked ${uniqueUrls.length.toLocaleString()} unique URLs from ${records.length.toLocaleString()} URL fields.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
