// Uses the existing local Wrangler OAuth session without printing/copying its value.
import { join } from 'node:path';
export const ACCOUNT = '44da992322566011378aed0df314e779';
export const DATABASE = '82bf6646-ed06-4c4d-94c3-c9b747940a7e';
export async function graphql(query: string, variables: Record<string, unknown> = {}) {
  const config = Bun.TOML.parse(await Bun.file(join(process.env.HOME!, '.wrangler/config/default.toml')).text()) as { oauth_token: string };
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${config.oauth_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const data = await response.json() as any;
  if (!response.ok || data.errors?.length) throw new Error(JSON.stringify({ status: response.status, errors: data.errors }));
  return data.data;
}
if (import.meta.main) {
  const data = await graphql('{__type(name:"account"){fields{name type{name kind ofType{name kind}}}}}');
  console.log(JSON.stringify(data.__type.fields.filter((f: any) => /durableObjectsPeriodic|d1Analytics/.test(f.name)), null, 2));
}
