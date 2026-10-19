/**
 * A fictional CRM for the eval suite. Every company, person and role here is
 * invented; none of it is read from or written to the real database.
 *
 * Kept small and deliberately awkward: two roles at one company (so "the
 * Northwind role" is ambiguous), a Researching role (so "applied to it" must
 * become a move, not a duplicate), and an interviewing role to move on.
 */
import type { ClassifierRows } from "../src/lib/ai/classify.ts";

export const ROWS: ClassifierRows = {
  companies: [
    { id: "co-northwind", name: "Northwind Analytics" },
    { id: "co-lumen", name: "Lumen Health" },
    { id: "co-brightline", name: "Brightline Capital" },
    { id: "co-rhodium", name: "Rhodium Group" },
  ],
  contacts: [
    { id: "ct-dara", name: "Dara Okafor", company_id: "co-northwind" },
    { id: "ct-sam", name: "Sam Patel", company_id: "co-lumen" },
  ],
  applications: [
    { id: "app-nw-da", company_name: "Northwind Analytics", role_title: "Data Analyst",
      stage: "applied", lane: "primary", kind: "job" },
    { id: "app-nw-bi", company_name: "Northwind Analytics", role_title: "BI Engineer",
      stage: "applied", lane: "secondary", kind: "job" },
    { id: "app-lumen", company_name: "Lumen Health", role_title: "Associate Product Manager",
      stage: "interviewing", lane: "primary", kind: "job" },
    { id: "app-bright", company_name: "Brightline Capital", role_title: "Investment Analyst",
      stage: "applied", lane: "primary", kind: "job" },
    { id: "app-rhodium", company_name: "Rhodium Group", role_title: "Research Analyst",
      stage: "researching", lane: "primary", kind: "job" },
  ],
};
