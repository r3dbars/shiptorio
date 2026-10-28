import { expect, test } from "bun:test";
import { ProgramLinks } from "../src/map/programLinks";

test("used programs are checked once, never successful compiler logs", () => {
  let reads = 0;
  const gl = { LINK_STATUS: 1, isContextLost: () => false, getProgramParameter: () => { reads++; return true; } };
  const cache = new ProgramLinks(), program = {} as WebGLProgram;
  expect(cache.valid(gl, program)).toBe(true); expect(cache.valid(gl, program)).toBe(true);
  expect(reads).toBe(1);
  cache.reset(); expect(cache.valid(gl, program)).toBe(true); expect(reads).toBe(2);
  expect(cache.valid(gl, {} as WebGLProgram)).toBe(true); expect(reads).toBe(3);
});
for (const status of [false, null]) test(`invalid vertex/fragment linkage (${status}) is never accepted or cached`, () => {
  let reads = 0;
  const cache = new ProgramLinks(), program = {} as WebGLProgram;
  const gl = { LINK_STATUS: 1, isContextLost: () => false, getProgramParameter: () => { reads++; return status; } };
  expect(cache.valid(gl, program)).toBe(false); expect(cache.valid(gl, program)).toBe(false); expect(reads).toBe(2);
});
test("lost-context status is neither queried nor reused after restoration", () => {
  let lost = true, reads = 0;
  const gl = { LINK_STATUS: 1, isContextLost: () => lost, getProgramParameter: () => { reads++; return false; } };
  const cache = new ProgramLinks(), program = {} as WebGLProgram;
  expect(cache.valid(gl, program)).toBe(true); expect(reads).toBe(0);
  lost = false;
  expect(cache.valid(gl, program)).toBe(false); expect(reads).toBe(1);
});

test("a context lost during the status query is not cached or misreported as bad linkage", () => {
  let lost = false;
  const cache = new ProgramLinks(), program = {} as WebGLProgram;
  const gl = { LINK_STATUS: 1, isContextLost: () => lost, getProgramParameter: () => { lost = true; return null; } };
  expect(cache.valid(gl, program)).toBe(true);
  lost = false;
  gl.getProgramParameter = () => null;
  expect(cache.valid(gl, program)).toBe(false);
});
