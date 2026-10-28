/** Validate used programs once per live context, without requesting successful compiler logs. */
export class ProgramLinks {
  private checked = new WeakSet<WebGLProgram>();
  reset() { this.checked = new WeakSet(); }
  valid(gl: Pick<WebGLRenderingContext, "isContextLost" | "getProgramParameter" | "LINK_STATUS">, program: WebGLProgram): boolean {
    if (gl.isContextLost()) return true; // Do not cache unavailable status during a lost context.
    if (this.checked.has(program)) return true;
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (gl.isContextLost()) return true; // A loss during the query is recovery, not a bad shader.
    if (linked !== true) return false;
    this.checked.add(program);
    return true;
  }
}
