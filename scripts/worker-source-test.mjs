export function stripWorkerDefaultExport(source) {
  return source.replace(/^[\t ]*export\s+default\s+__wm_default\s*;[ \t]*$/gm, "");
}
