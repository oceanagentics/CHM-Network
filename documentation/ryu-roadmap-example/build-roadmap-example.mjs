import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/danvallentyne/dev/oceanagentics/CHM-Network/outputs/ryu-roadmap-example";
const outputPath = path.join(outputDir, "ryu-internal-product-roadmap-example.xlsx");

await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const statusOptions = ["Not Started", "Ready", "In Progress", "Blocked", "Done"];
const priorityOptions = ["P0", "P1", "P2", "P3"];
const effortOptions = ["XS", "S", "M", "L", "XL"];
const gateOptions = ["Discovery", "Spec Approved", "Build Complete", "QA Passed", "Launched"];

const roadmapRows = [
  [
    "R1-F01",
    "Release 1",
    "Record backlog triage",
    "Define the near-term record set and review order.",
    "P0",
    "Ready",
    "Product",
    new Date("2026-08-24"),
    new Date("2026-08-28"),
    "S",
    "Existing Ryu DB",
    "Inventory current nodes, classify target systems, assign review depth, and agree on what must be rich versus thin.",
    "Priority list is approved, each selected record has an owner and target review state, and deferred records are explicitly marked.",
    "Spec Approved",
    "Use this as the intake gate for content work.",
  ],
  [
    "R1-F02",
    "Release 1",
    "Rich record backfill",
    "Move selected priority systems from thin to rich records.",
    "P0",
    "Not Started",
    "Research",
    new Date("2026-08-31"),
    new Date("2026-09-11"),
    "L",
    "R1-F01",
    "Add summaries, operators, descriptions, source-backed access paths, identifiers, caveats, usage metrics, and review metadata.",
    "At least six priority systems have source-backed rich records and no unresolved source refs in visible user-facing fields.",
    "QA Passed",
    "Good first release demo because it makes Ryu visibly more useful.",
  ],
  [
    "R1-F03",
    "Release 1",
    "Data record visibility",
    "Make data descriptors auditable from the UI.",
    "P1",
    "Ready",
    "Frontend",
    new Date("2026-09-02"),
    new Date("2026-09-06"),
    "M",
    "Data descriptors already exist",
    "Show descriptor IDs, descriptions, categories, and resolved source records from the existing details_json data descriptors.",
    "Reviewer can verify every visible data type, format, and standard without opening raw fields.",
    "QA Passed",
    "Mirrors the current cleanup tracker.",
  ],
  [
    "R1-F04",
    "Release 1",
    "Review trail surface",
    "Expose record depth, review history, and timestamps.",
    "P1",
    "Not Started",
    "Frontend",
    new Date("2026-09-04"),
    new Date("2026-09-10"),
    "S",
    "Review metadata",
    "Add a compact review section for latest agent research, latest human review, created date, and updated date.",
    "Reviewer can tell whether a record is agent-researched, human-reviewed, stale, or needs revision from User View.",
    "QA Passed",
    "Useful for team accountability.",
  ],
  [
    "R2-F01",
    "Release 2",
    "Tool record archetype",
    "Define the canonical Ryu route/tool record pattern.",
    "P0",
    "Ready",
    "Product + Backend",
    new Date("2026-09-09"),
    new Date("2026-09-13"),
    "M",
    "Current RyuRoute and RyuPortalRoute types",
    "Document required fields for route status, mode, priority, capabilities, target, upstream, format, contract ref, auth, caveats, supported tools, and source refs.",
    "One exemplar route record is complete, documented, source-backed, and accepted as the template for future route records.",
    "Spec Approved",
    "Decision: confirm whether 'tool record' means route metadata or a separate entity.",
  ],
  [
    "R2-F02",
    "Release 2",
    "Tool record backfill",
    "Fill route/tool records for the initial priority systems.",
    "P0",
    "Not Started",
    "Backend + Research",
    new Date("2026-09-16"),
    new Date("2026-09-27"),
    "L",
    "R2-F01",
    "Backfill route records, source refs, contract refs, delivery formats, route caveats, and supported tool metadata.",
    "Priority systems return complete route metadata through API and MCP, with planned routes separated from live routes.",
    "QA Passed",
    "Start with Oregon DLCD, GEBCO, OSM/Protomaps, NOAA whale shapes, and fisheries context.",
  ],
  [
    "R2-F03",
    "Release 2",
    "Route validation checks",
    "Prevent stale or unusable operational routes.",
    "P1",
    "Not Started",
    "Backend",
    new Date("2026-09-23"),
    new Date("2026-10-04"),
    "M",
    "R2-F02",
    "Add lightweight checks for route target availability, contract existence, source refs, supported formats, and blocked/planned/live state.",
    "Validation output identifies broken URLs, missing contracts, missing source refs, and routes marked live without a successful check.",
    "Build Complete",
    "Can start as a script or CI check later.",
  ],
  [
    "R2-F04",
    "Release 2",
    "MCP portal hardening",
    "Make Ryu reliable as a discovery and routing portal.",
    "P0",
    "In Progress",
    "Backend",
    new Date("2026-09-18"),
    new Date("2026-10-02"),
    "M",
    "Existing list/search/get tools",
    "Confirm query parameters, route inclusion behavior, response schema, error handling, and example prompts for system discovery.",
    "list_systems, search_systems, and get_system pass smoke tests and return enough route/source/caveat metadata for Deeptime.",
    "QA Passed",
    "Existing implementation gives this a head start.",
  ],
  [
    "R3-F01",
    "Release 3",
    "Roadmap-quality filters",
    "Help reviewers find records and routes that need work.",
    "P1",
    "Not Started",
    "Frontend",
    new Date("2026-10-07"),
    new Date("2026-10-16"),
    "M",
    "Shared search state",
    "Add filters for record depth, review state, route status, route mode, capability, delivery format, and contract type.",
    "A reviewer can filter to thin agent-researched systems, live GeoJSON routes, or planned ArcGIS REST routes from the Systems panel.",
    "QA Passed",
    "Build on existing search/filter model.",
  ],
  [
    "R3-F02",
    "Release 3",
    "Search and graph alignment",
    "Make one search intent drive both Systems and graph visibility.",
    "P2",
    "Not Started",
    "Frontend",
    new Date("2026-10-14"),
    new Date("2026-10-25"),
    "L",
    "Search system plan",
    "Apply shared search state to graph projection, preserve necessary context nodes, and show match reasons consistently.",
    "Typing once filters both Systems and graph panes without breaking selection, saved views, or view modes.",
    "QA Passed",
    "Can be split if graph filtering gets complicated.",
  ],
  [
    "R3-F03",
    "Release 3",
    "Public read-only build",
    "Publish Ryu safely for external viewing.",
    "P0",
    "Ready",
    "DevOps",
    new Date("2026-10-01"),
    new Date("2026-10-10"),
    "M",
    "Existing publish script",
    "Verify sanitized bootstrap export, read-only behavior, production deploy script, smoke checks, and rollback notes.",
    "Public URL loads, bootstrap payload validates, local paths are removed, and publish steps are repeatable by another team member.",
    "Launched",
    "Consider static IP and HTTPS as separate infra tasks.",
  ],
  [
    "R3-F04",
    "Release 3",
    "Release checklist",
    "Create the team's accountable release process.",
    "P1",
    "Not Started",
    "Product + Engineering",
    new Date("2026-10-05"),
    new Date("2026-10-12"),
    "S",
    "Roadmap and deployment flow",
    "Define release gates, demo criteria, data review requirements, test evidence, deploy owner, and rollback owner.",
    "Every launch item has a named owner, acceptance evidence, release date, and sign-off state.",
    "Spec Approved",
    "This is what keeps roadmap rows from becoming wish-list rows.",
  ],
];

const releaseRows = [
  ["Release 1", "Reviewable records", "Make priority systems complete enough for internal review.", "2026-08-24 to 2026-09-13", "Priority list approved", "Rich records and audit-facing UI shipped", "Scope creep in record depth", "Walk through six source-backed systems"],
  ["Release 2", "Usable route/tool records", "Make Ryu useful for system discovery and operational routing.", "2026-09-09 to 2026-10-04", "Tool record archetype accepted", "Priority route records work through API/MCP", "Ambiguous route status definitions", "Run Deeptime-style discovery prompt"],
  ["Release 3", "Accountable operation", "Add filters, public hosting, and launch process.", "2026-10-01 to 2026-10-25", "Release 1/2 data quality accepted", "Public read-only build and release checklist complete", "Deployment ownership unclear", "Open public build and filter live routes"],
];

const acceptanceRows = roadmapRows.map((row) => [
  row[0],
  row[2],
  row[12],
  "Representative user path is verified manually and no critical UI copy is hidden or clipped.",
  row[10] ? `Depends on ${row[10]}` : "No dependency",
  row[13],
]);

const riskRows = [
  ["Decision", "Meaning of tool record", "Wrong model could create duplicate concepts.", "Product", new Date("2026-09-09"), "Decide route metadata versus separate tool entity before implementation.", "Open"],
  ["Risk", "Record scope expansion", "Research work can grow faster than engineering capacity.", "Product", new Date("2026-08-28"), "Cap Release 1 to named priority systems and defer the rest.", "Open"],
  ["Risk", "Route status inconsistency", "Clients may call planned or broken routes.", "Backend", new Date("2026-09-20"), "Define status meanings and add route validation checks.", "Open"],
  ["Dependency", "Public hosting credentials", "Deploy process may rely on one person's local key.", "DevOps", new Date("2026-10-01"), "Document deploy access, rollback path, and backup owner.", "Open"],
  ["Risk", "Search relevance drift", "Source/provenance text could swamp identity fields.", "Frontend", new Date("2026-10-14"), "Keep weighted field definitions and visible match reasons.", "Watch"],
];

const definitionsRows = [
  ["Status", "Not Started", "Accepted into roadmap, no active work yet."],
  ["Status", "Ready", "Scoped enough for implementation or research work to begin."],
  ["Status", "In Progress", "Owner is actively working the item."],
  ["Status", "Blocked", "Cannot progress without a named decision, dependency, or access fix."],
  ["Status", "Done", "Acceptance criteria are met and evidence is linked or documented."],
  ["Priority", "P0", "Release-blocking for the current internal milestone."],
  ["Priority", "P1", "Important for launch quality, but not always a release blocker."],
  ["Priority", "P2", "Useful enhancement that can move if the release is at risk."],
  ["Priority", "P3", "Backlog item or polish."],
  ["Effort", "XS", "Less than one day."],
  ["Effort", "S", "One to two days."],
  ["Effort", "M", "Three to five days."],
  ["Effort", "L", "One to two weeks."],
  ["Effort", "XL", "Needs further breakdown before commitment."],
  ["Gate", "Discovery", "Problem understood but scope is not committed."],
  ["Gate", "Spec Approved", "Scope, owner, and acceptance criteria are agreed."],
  ["Gate", "Build Complete", "Implementation is complete and ready for QA/review."],
  ["Gate", "QA Passed", "Acceptance evidence exists and no launch blockers remain."],
  ["Gate", "Launched", "Released to the intended audience."],
];

function addSheet(name) {
  return workbook.worksheets.add(name);
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidth = width;
  });
}

function styleHeader(sheet, range) {
  const header = sheet.getRange(range);
  header.format = {
    fill: "#F3F4F6",
    font: { bold: true, color: "#111827" },
    borders: { preset: "inside", style: "thin", color: "#D1D5DB" },
  };
  header.format.wrapText = true;
}

function styleBody(sheet, range) {
  const body = sheet.getRange(range);
  body.format = {
    borders: { preset: "inside", style: "thin", color: "#E5E7EB" },
  };
  body.format.wrapText = true;
}

function styleTitle(sheet, range) {
  const title = sheet.getRange(range);
  title.format = {
    fill: "#E5F3F0",
    font: { bold: true, color: "#111827", size: 14 },
    borders: { preset: "outside", style: "thin", color: "#9CA3AF" },
  };
}

const summary = addSheet("Summary");
summary.getRange("A1:F1").merge();
summary.getRange("A1").values = [["Ryu Internal Product Roadmap Example"]];
styleTitle(summary, "A1:F1");
summary.getRange("A3:B11").values = [
  ["Metric", "Value"],
  ["Total roadmap items", null],
  ["P0 items", null],
  ["Ready or in progress", null],
  ["Blocked items", null],
  ["Launch-targeted items", null],
  ["Next release", "Release 1"],
  ["Roadmap owner", "Product"],
  ["Last refreshed", new Date("2026-08-20")],
];
summary.getRange("B4:B8").formulas = [
  ["=COUNTA(Roadmap!A2:A200)"],
  ["=COUNTIF(Roadmap!E2:E200,\"P0\")"],
  ["=COUNTIF(Roadmap!F2:F200,\"Ready\")+COUNTIF(Roadmap!F2:F200,\"In Progress\")"],
  ["=COUNTIF(Roadmap!F2:F200,\"Blocked\")"],
  ["=COUNTIF(Roadmap!N2:N200,\"Launched\")"],
];
summary.getRange("A13:F13").values = [["Release", "Items", "Not Started", "Ready", "In Progress", "Done"]];
summary.getRange("A14:A16").values = [["Release 1"], ["Release 2"], ["Release 3"]];
summary.getRange("B14:F14").formulas = [
  [
    "=COUNTIF(Roadmap!B$2:B$200,A14)",
    "=COUNTIFS(Roadmap!B$2:B$200,A14,Roadmap!F$2:F$200,\"Not Started\")",
    "=COUNTIFS(Roadmap!B$2:B$200,A14,Roadmap!F$2:F$200,\"Ready\")",
    "=COUNTIFS(Roadmap!B$2:B$200,A14,Roadmap!F$2:F$200,\"In Progress\")",
    "=COUNTIFS(Roadmap!B$2:B$200,A14,Roadmap!F$2:F$200,\"Done\")",
  ],
];
summary.getRange("B14:F16").fillDown();
styleHeader(summary, "A3:B3");
styleBody(summary, "A4:B11");
styleHeader(summary, "A13:F13");
styleBody(summary, "A14:F16");
summary.getRange("B4:B8").format.numberFormat = "#,##0";
summary.getRange("B11").setNumberFormat("yyyy-mm-dd");
setWidths(summary, [28, 20, 18, 16, 18, 16]);
summary.freezePanes.freezeRows(3);
summary.showGridLines = false;

const roadmap = addSheet("Roadmap");
const roadmapHeaders = [
  "ID",
  "Release",
  "Feature",
  "Outcome",
  "Priority",
  "Status",
  "Owner",
  "Start",
  "Target",
  "Effort",
  "Dependencies",
  "Scope of Work",
  "Acceptance Criteria",
  "Launch Gate",
  "Notes",
];
roadmap.getRange("A1:O1").values = [roadmapHeaders];
roadmap.getRange(`A2:O${roadmapRows.length + 1}`).values = roadmapRows;
styleHeader(roadmap, "A1:O1");
styleBody(roadmap, `A2:O${roadmapRows.length + 1}`);
roadmap.getRange(`H2:I${roadmapRows.length + 1}`).setNumberFormat("yyyy-mm-dd");
setWidths(roadmap, [12, 13, 28, 36, 10, 16, 18, 14, 14, 10, 24, 54, 54, 18, 42]);
roadmap.getRange(`L2:O${roadmapRows.length + 1}`).format.rowHeight = 56;
roadmap.freezePanes.freezeRows(1);
roadmap.showGridLines = false;

const releases = addSheet("Release Plan");
releases.getRange("A1:H1").values = [["Release", "Theme", "Objective", "Target Window", "Entry Criteria", "Exit Criteria", "Primary Risks", "Demo"]];
releases.getRange(`A2:H${releaseRows.length + 1}`).values = releaseRows;
styleHeader(releases, "A1:H1");
styleBody(releases, `A2:H${releaseRows.length + 1}`);
setWidths(releases, [14, 24, 46, 25, 32, 38, 36, 34]);
releases.getRange(`A2:H${releaseRows.length + 1}`).format.rowHeight = 58;
releases.freezePanes.freezeRows(1);
releases.showGridLines = false;

const acceptance = addSheet("Acceptance Matrix");
acceptance.getRange("A1:F1").values = [["Feature ID", "Feature", "Functional Acceptance", "UX / Workflow Acceptance", "Dependency Evidence", "Release Gate"]];
acceptance.getRange(`A2:F${acceptanceRows.length + 1}`).values = acceptanceRows;
styleHeader(acceptance, "A1:F1");
styleBody(acceptance, `A2:F${acceptanceRows.length + 1}`);
setWidths(acceptance, [14, 30, 54, 48, 34, 18]);
acceptance.getRange(`C2:E${acceptanceRows.length + 1}`).format.rowHeight = 54;
acceptance.freezePanes.freezeRows(1);
acceptance.showGridLines = false;

const risks = addSheet("Risks & Decisions");
risks.getRange("A1:G1").values = [["Type", "Item", "Impact", "Owner", "Decision Needed By", "Resolution Path", "Status"]];
risks.getRange(`A2:G${riskRows.length + 1}`).values = riskRows;
styleHeader(risks, "A1:G1");
styleBody(risks, `A2:G${riskRows.length + 1}`);
risks.getRange(`E2:E${riskRows.length + 1}`).setNumberFormat("yyyy-mm-dd");
setWidths(risks, [14, 32, 42, 18, 20, 50, 14]);
risks.getRange(`B2:F${riskRows.length + 1}`).format.rowHeight = 52;
risks.freezePanes.freezeRows(1);
risks.showGridLines = false;

const definitions = addSheet("Definitions");
definitions.getRange("A1:C1").values = [["Category", "Value", "Meaning"]];
definitions.getRange(`A2:C${definitionsRows.length + 1}`).values = definitionsRows;
styleHeader(definitions, "A1:C1");
styleBody(definitions, `A2:C${definitionsRows.length + 1}`);
setWidths(definitions, [16, 22, 70]);
definitions.freezePanes.freezeRows(1);
definitions.showGridLines = false;

for (const sheetName of ["Summary", "Roadmap", "Release Plan", "Acceptance Matrix", "Risks & Decisions", "Definitions"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `${sheetName.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson);

const overview = await workbook.inspect({
  kind: "workbook,sheet,region",
  maxChars: 5000,
  tableMaxRows: 8,
  tableMaxCols: 8,
});
console.log(overview.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
