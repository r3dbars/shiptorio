import { z } from "zod";
import { DATA_POLICY, untrustedData, validatePlan, pathAllowed } from "../../server/src/injection-policy";

export const CODEX_EDIT_LIMITS = { transcriptBytes: 512000, events: 1000, replyBytes: 128000, edits: 20, textBytes: 32000, fileBytes: 256000 } as const;
const edit = z.object({ path: z.string().min(1).max(200), create: z.boolean(), oldText: z.string().max(CODEX_EDIT_LIMITS.textBytes), newText: z.string().max(CODEX_EDIT_LIMITS.textBytes) }).strict();
const response = z.object({ summary: z.string().min(1).max(500), edits: z.array(edit).min(1).max(CODEX_EDIT_LIMITS.edits) }).strict();
export type CodexEdits = z.infer<typeof response>;
export const CODEX_EDIT_SCHEMA = z.toJSONSchema(response);

export function codexEditPrompt(job: { plan: string; allowedPaths: string[] }, files: { path: string; content: string }[]): string {
  validatePlan(job.plan, job.allowedPaths);
  if (files.some(f => !job.allowedPaths.includes(f.path))) throw Error("Unapproved assembler context");
  return `${DATA_POLICY}\nReturn ONLY JSON matching the supplied schema. Do not call ANY tools, read or write files, run commands, access credentials, change settings, invoke agents, commit or publish. The supervisor supplies source evidence below and applies your proposal after you exit. Make the smallest fix and regression test within these exact approved paths: ${JSON.stringify(job.allowedPaths)}. Each edit replaces one unique nonempty exact oldText with newText; use enough surrounding text to match exactly once. Multiple edits to one file run in order. Do not return whole-file replacements for existing files. For a new file only, set create=true and oldText=""; newText is its complete content. For existing files set create=false. No deletion or rename. Source excerpts may be truncated: preserve everything outside each exact replacement.\n${untrustedData(job.plan, 17000)}\n${untrustedData(JSON.stringify(files), 64000)}`;
}

/** Parse the completed final message, never scrape JSON from reasoning/tool output. */
export function parseCodexEdits(transcript: string, allowed: string[]): CodexEdits {
  if (Buffer.byteLength(transcript) > CODEX_EDIT_LIMITS.transcriptBytes) throw Error("Codex transcript exceeds limit");
  const lines = transcript.trim().split("\n");
  if (lines.length > CODEX_EDIT_LIMITS.events) throw Error("Too many Codex events");
  let final: string | undefined, completed = false;
  for (const line of lines) {
    let event: any;
    try { event = JSON.parse(line); } catch { throw Error("Malformed Codex event"); }
    if (!event || typeof event !== "object" || typeof event.type !== "string" || completed) throw Error("Invalid Codex event sequence");
    if (event.type === "error" || event.type === "turn.failed") throw Error("Codex turn failed");
    if (event.item && !["agent_message", "reasoning"].includes(event.item.type)) throw Error("Codex attempted a tool instead of returning edits");
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      if (typeof event.item.text !== "string") throw Error("Missing Codex message");
      final = event.item.text;
    }
    if (event.type === "turn.completed") completed = true;
  }
  if (!completed || !final || Buffer.byteLength(final) > CODEX_EDIT_LIMITS.replyBytes) throw Error("Missing or oversized completed Codex response");
  let value: unknown;
  try { value = JSON.parse(final); } catch { throw Error("Codex final message is not JSON"); }
  return checkEditProposal(value, allowed);
}

/** Shared by every subscription adapter: the proposal shape and scope rules never depend on the provider. */
export function checkEditProposal(value: unknown, allowed: string[]): CodexEdits {
  const parsed = response.parse(value);
  for (const e of parsed.edits) {
    if (!allowed.includes(e.path) || !pathAllowed(e.path)) throw Error("Codex edit outside approved scope");
    if (Buffer.byteLength(e.oldText) > CODEX_EDIT_LIMITS.textBytes || Buffer.byteLength(e.newText) > CODEX_EDIT_LIMITS.textBytes || e.oldText.includes("\0") || e.newText.includes("\0")) throw Error("Invalid Codex edit text");
    if (e.create ? e.oldText !== "" || e.newText === "" : !e.oldText || e.oldText === e.newText) throw Error("Invalid Codex replacement");
  }
  return parsed;
}

/** Agent processes must be stopped before this trusted, credential-free sandbox runs. */
export async function applyCodexEdits(sandbox: import("./sandbox").CheckSandbox, proposal: CodexEdits, allowed: string[]): Promise<string[]> {
  // Validate again at the write boundary, including callers other than the JSONL adapter.
  const checked = parseCodexEdits(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(proposal) } }) + '\n{"type":"turn.completed"}', allowed);
  const status = await sandbox.run(["git", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "status", "--porcelain", "--untracked-files=all"]);
  if (status.code || status.out.trim()) throw Error("Codex proposal requires a clean checkout");
  const program = `import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,realpathSync,writeSync,ftruncateSync,mkdirSync} from "node:fs";
import {join} from "node:path";
const root=realpathSync(process.cwd()), edits=JSON.parse(process.argv[1]), limit=${CODEX_EDIT_LIMITS.fileBytes};
const files=new Map();
function parent(path,create){let current=root;for(const part of path.split("/").slice(0,-1)){current=join(current,part);try{if(!lstatSync(current).isDirectory()||realpathSync(current)!==current)throw Error("Unsafe edit parent");}catch(e){if(e.code!=="ENOENT")throw e;if(!create)return false;mkdirSync(current,{mode:0o700});}}return true;}
for(const e of edits){if(!files.has(e.path)){const target=join(root,e.path);let original=null,info=null;
 if(parent(e.path,false)){try{info=lstatSync(target);if(!info.isFile()||info.nlink!==1||info.size>limit)throw Error("Unsafe edit target");const fd=openSync(target,constants.O_RDONLY|constants.O_NOFOLLOW);try{const actual=fstatSync(fd);if(actual.ino!==info.ino||actual.dev!==info.dev)throw Error("Changed edit target");const bytes=readFileSync(fd);if(bytes.length>limit||bytes.includes(0))throw Error("Invalid edit source");original=bytes.toString("utf8");if(!Buffer.from(original).equals(bytes))throw Error("Non UTF-8 edit source");}finally{closeSync(fd);}}catch(error){if(error.code!=="ENOENT")throw error;}}
 files.set(e.path,{original,text:original,info,created:false});}
 const f=files.get(e.path);
 if(e.create){if(f.original!==null||f.created)throw Error("Create requires an absent file");f.text=e.newText;f.created=true;}
 else{if(f.original===null||f.created)throw Error("Replace requires an existing file");const first=f.text.indexOf(e.oldText);if(first<0||f.text.indexOf(e.oldText,first+1)>=0)throw Error("Replacement must match exactly once");f.text=f.text.slice(0,first)+e.newText+f.text.slice(first+e.oldText.length);}
 if(Buffer.byteLength(f.text)>limit)throw Error("Edited file exceeds limit");}
// Validate the entire proposal before any write. Open regular files without following links.
for(const [path,f] of files){if(f.text===f.original)throw Error("Proposal has no effect");}
for(const [path,f] of files){parent(path,true);const target=join(root,path);const fd=openSync(target,constants.O_RDWR|constants.O_NOFOLLOW|(f.original===null?constants.O_CREAT|constants.O_EXCL:0),0o600);try{const info=fstatSync(fd);if(!info.isFile()||info.nlink!==1||(f.info&&(info.ino!==f.info.ino||info.dev!==f.info.dev)))throw Error("Changed edit target");if(f.original!==null&&readFileSync(fd,"utf8")!==f.original)throw Error("Edit source changed");ftruncateSync(fd,0);const bytes=Buffer.from(f.text);let written=0;while(written<bytes.length){const n=writeSync(fd,bytes,written,bytes.length-written,written);if(!n)throw Error("Short edit write");written+=n;}}finally{closeSync(fd);}}
console.log(JSON.stringify([...files.keys()]));`;
  const result = await sandbox.run([process.execPath, "--no-env-file", "--config=/dev/null", "-e", program, JSON.stringify(checked.edits)]);
  if (result.code) throw Error("Supervisor rejected Codex edits; exact regular-file match required");
  const paths: unknown = JSON.parse(result.out);
  if (!Array.isArray(paths) || !paths.length || paths.some(p => typeof p !== "string" || !allowed.includes(p))) throw Error("Invalid applied Codex scope");
  return paths as string[];
}
