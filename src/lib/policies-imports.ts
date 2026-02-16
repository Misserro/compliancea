/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-expect-error - JS module without type definitions
export {
  evaluateDocument,
  applyActions,
  getAllPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  deletePolicy,
  testPolicy,
} from "../../lib/policies.js";
