// Validate every schema (and the bundled example) with Ajv 2020-12.
// Usage:  npm install && npm run validate
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// common.schema.json lives at the repo root and is $ref'd by every module
// (e.g. "../common.schema.json#/$defs/money") -- register it first so those
// relative refs resolve.
const common = JSON.parse(readFileSync("common.schema.json", "utf8"));
ajv.addSchema(common, common.$id);

const dirs = ["capex-plan", "procurement-plan", "project-monitoring", "reference-data"];
const schemas = {};

for (const d of dirs) {
  for (const f of readdirSync(d)) {
    if (!f.endsWith(".json")) continue;
    const path = join(d, f);
    const schema = JSON.parse(readFileSync(path, "utf8"));
    ajv.addSchema(schema, schema.$id ?? path);
    schemas[path] = schema;
  }
}

let failures = 0;
for (const [path, schema] of Object.entries(schemas)) {
  try {
    ajv.compile(schema);
    console.log("OK   ", path);
  } catch (e) {
    failures++;
    console.error("FAIL ", path, e.message);
  }
}

// Validate the linked example set.
const example = JSON.parse(readFileSync("examples/lifecycle-example.json", "utf8"));
const map = {
  "capex-budget": "capex-plan/capex-budget.schema.json",
  "approval-matrix": "capex-plan/approval-matrix.schema.json",
  "asset-request": "capex-plan/asset-request.schema.json",
  "bill-of-materials": "capex-plan/bill-of-materials.schema.json",
  "procurement-item": "procurement-plan/procurement-item.schema.json",
  "purchase-requisition": "procurement-plan/purchase-requisition.schema.json",
  "procurement-activity": "procurement-plan/procurement-activity.schema.json",
  "vendor-bid": "procurement-plan/vendor-bid.schema.json",
  "rfq-document-checklist": "procurement-plan/rfq-document-checklist.schema.json",
  "rfq-checklist-result": "procurement-plan/rfq-checklist-result.schema.json",
  "post-qualification": "procurement-plan/post-qualification.schema.json",
  "purchase-order": "procurement-plan/purchase-order.schema.json",
  "project-charter": "project-monitoring/project-charter.schema.json",
  "milestone": "project-monitoring/milestone.schema.json",
  "financial-tracking": "project-monitoring/financial-tracking.schema.json",
  "risk-issue-log": "project-monitoring/risk-issue-log.schema.json",
  "vendor": "reference-data/vendor.schema.json",
  "contractor": "reference-data/contractor.schema.json",
  "lookup-option": "reference-data/lookup-option.schema.json",
  "profile": "reference-data/profile.schema.json",
};
for (const [key, path] of Object.entries(map)) {
  const validate = ajv.compile(schemas[path]);
  if (validate(example[key])) {
    console.log("PASS ", key, "example");
  } else {
    failures++;
    console.error("FAIL ", key, JSON.stringify(validate.errors, null, 2));
  }
}

console.log(failures === 0 ? "\nAll schemas and examples valid." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
