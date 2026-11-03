import { checkSandbox, type CheckSandbox } from "./sandbox";
import { realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Pin the checkout before any repository process runs, including resumed workspaces. */
export async function localBoundary(work: string): Promise<CheckSandbox> {
  const expected = join(await realpath(dirname(work)), basename(work));
  return checkSandbox(expected, undefined, { exactRoot: true });
}

// The model request stays in the supervisor; all repository path resolution and IO stays in the OS sandbox.
const program = `import {constants,openSync,closeSync,fstatSync,lstatSync,realpathSync,readSync,writeSync,ftruncateSync,mkdirSync} from "node:fs";
import {join} from "node:path";
const {paths,limit,edits,expected}=JSON.parse(await Bun.stdin.text()),root=realpathSync(process.cwd());
function parent(path,create){let current=root;for(const part of path.split("/").slice(0,-1)){current=join(current,part);try{if(!lstatSync(current).isDirectory()||realpathSync(current)!==current)throw Error("Unsafe parent");}catch(e){if(e.code!=="ENOENT")throw e;if(!create)return false;mkdirSync(current,{mode:0o700});}}return true;}
function read(fd){const info=fstatSync(fd);if(!info.isFile()||info.nlink!==1||info.size>limit)throw Error("Unsafe file");const bytes=Buffer.alloc(limit+1);const count=readSync(fd,bytes,0,bytes.length,0);if(count>limit)throw Error("Oversized file");const value=bytes.subarray(0,count),text=value.toString("utf8");if(value.includes(0)||!Buffer.from(text).equals(value))throw Error("Invalid source");return text;}
const files=Object.create(null);
for(const path of paths){if(!/^[\\w./@+-]+$/.test(path)||path.split("/").some(p=>!p||p===".."||p==="."||p.toLowerCase().startsWith(".git")))throw Error("Unsafe path");
 files[path]=null;if(!parent(path,false))continue;let fd;try{fd=openSync(join(root,path),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);files[path]=read(fd);}catch(e){if(e.code!=="ENOENT")throw e;}finally{if(fd!==undefined)closeSync(fd);}}
if(edits){for(const e of edits){if(!paths.includes(e.path)||typeof e.content!=="string"||Buffer.byteLength(e.content)>limit||files[e.path]!==expected[e.path])throw Error("Source changed or invalid edit");}
 for(const e of edits){parent(e.path,true);const fd=openSync(join(root,e.path),constants.O_RDWR|constants.O_NOFOLLOW|constants.O_NONBLOCK|(files[e.path]===null?constants.O_CREAT|constants.O_EXCL:0),0o600);try{if(read(fd)!==(files[e.path]??""))throw Error("Source changed");const bytes=Buffer.from(e.content);ftruncateSync(fd,0);let written=0;while(written<bytes.length){const n=writeSync(fd,bytes,written,bytes.length-written,written);if(!n)throw Error("Short write");written+=n;}}finally{closeSync(fd);}}}
console.log(JSON.stringify(files));`;

export async function localFiles(sandbox: CheckSandbox, work: string, paths: string[], limit: number, change?: { edits: { path: string; content: string }[]; expected: Record<string, string | null> }): Promise<Record<string, string | null>> {
  const result = await sandbox.run([process.execPath, "--no-env-file", "--config=/dev/null", "-e", program], work, { input: JSON.stringify({ paths, limit, ...change }) });
  if (result.code) throw new Error("Local model source requires unchanged, bounded regular files and regular directories inside the verification sandbox");
  const files = JSON.parse(result.out) as Record<string, string | null>;
  if (!files || typeof files !== "object" || Object.keys(files).length !== paths.length || paths.some(path => files[path] !== null && (typeof files[path] !== "string" || Buffer.byteLength(files[path]!) > limit))) throw new Error("Invalid local model file snapshot");
  return files;
}
