/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-expect-error - JS module without type definitions
export {
  computeFileHash,
  computeContentHash,
  findDuplicates,
  findNearDuplicates,
} from "../../lib/hashing.js";
