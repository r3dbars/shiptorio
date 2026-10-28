import { graphql, ACCOUNT, DATABASE } from './cf-analytics';
const NAMESPACE = '187f0a43e43d4e869e501e5192eec961';
const file = process.argv[2];
if (!file?.startsWith('tests/load/evidence/')) throw new Error('Pass a committed staging load report path');
const report = await Bun.file(file).json();
if (report.origin !== 'https://shiptorio.dev' || !report.startedAt || !report.endedAt) throw new Error('Missing staging run window');
const start = report.observedAt ?? report.startedAt, end = report.endedAt;
const query = `query($account: string!, $database: string!, $namespace: string!, $start: Time!, $end: Time!) {
 viewer { accounts(filter: {accountTag: $account}) {
  d1AnalyticsAdaptiveGroups(limit: 32, filter: {databaseId: $database, datetime_geq: $start, datetime_lt: $end}, orderBy: [datetimeMinute_ASC]) {
   dimensions {datetimeMinute} sum {rowsRead rowsWritten readQueries writeQueries} avg {sampleInterval}
  }
  durableObjectsPeriodicGroups(limit: 32, filter: {namespaceId: $namespace, datetime_geq: $start, datetime_lt: $end}, orderBy: [datetimeMinute_ASC]) {
   dimensions {datetimeMinute} sum {cpuTime inboundWebsocketMsgCount outboundWebsocketMsgCount exceededCpuErrors fatalInternalErrors}
  }
 } }
}`;
const variables = { account: ACCOUNT, database: DATABASE, namespace: NAMESPACE, start, end };
const raw = await graphql(query, variables);
const data = raw.viewer.accounts[0];
const d1 = data.d1AnalyticsAdaptiveGroups as any[];
const objects = data.durableObjectsPeriodicGroups as any[];
const minutes = (Date.parse(end) - Date.parse(start)) / 60000;
const sum = (list: any[], field: string) => list.reduce((s, b) => s + b.sum[field], 0);
const capturedAt = new Date().toISOString();
const analytics = { capturedAt, query, variables, raw, window: 'Full attempted run including preflight and cold admission; report.startedAt marks the separate ten-minute observation phase', units: { cpuTime: 'microseconds (Cloudflare schema description)', d1: 'rows; sampled adaptive groups, see sampleInterval' },
 summary: { minutes, cpuMs: objects.length ? sum(objects, 'cpuTime') / 1000 : null, d1RowsReadPerMinute: d1.length ? sum(d1, 'rowsRead') / minutes : null, d1RowsWrittenPerMinute: d1.length ? sum(d1, 'rowsWritten') / minutes : null } };
await Bun.write(file.replace('.json', '-analytics.json'), JSON.stringify(analytics, null, 2) + '\n');
report.cloudflare = { ...analytics.summary, analyticsFile: file.replace('.json', '-analytics.json'), capturedAt };
await Bun.write(file, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ buckets: { d1: d1.length, durableObject: objects.length }, summary: analytics.summary }));
