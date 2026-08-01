// Validate every schema (and the bundled example) with Ajv 2020-12.
// Usage:  npm install && npm run validate
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const dirs = ["capex-plan", "procurement-plan", "project-monitoring"];
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
  "asset-request": "capex-plan/asset-request.schema.json",
  "approval-matrix": "capex-plan/approval-matrix.schema.json",
  "procurement-item": "procurement-plan/procurement-item.schema.json",
  "purchase-requisition": "procurement-plan/purchase-requisition.schema.json",
  "vendor-bidding": "procurement-plan/vendor-bidding.schema.json",
  "purchase-order": "procurement-plan/purchase-order.schema.json",
  "project-charter": "project-monitoring/project-charter.schema.json",
  "milestone-tracker": "project-monitoring/milestone-tracker.schema.json",
  "financial-tracking": "project-monitoring/financial-tracking.schema.json",
  "risk-issue-log": "project-monitoring/risk-issue-log.schema.json",
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
