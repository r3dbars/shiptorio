import type { CardView, DeckView } from '../contract';
import type { RunnerStatus } from '../../ui/runnerStatus';
import { runnerInstallCommand } from '../../runner-install';

type Repo = { fullName: string };
type Issue = { id: number; number: number; title: string; body: string };
type Pane = 'repos' | 'issues' | 'power' | 'setup' | 'disconnect';
type Options = { repo?: string; origin: string; path: string; fetch?: typeof fetch; navigate: (url: string) => void; copy: (text: string) => Promise<void>; onStart?: (id: string) => void; now?: () => number };

/** Browsing is read-only. Starting one issue requests a plan; a separate card approves the build. */
export function createConnections(o: Options) {
  const request = o.fetch ?? fetch, now = o.now ?? Date.now;
  let accountChecked = false;
  let pane: Pane | null = null, revision = 0, displayRevision = 0, busy = false, refreshing = false, error = '', login = false;
  let repos: Repo[] = [], issues: Issue[] = [], index = 0, page = 1, nextPage: number | null = null;
  let status: RunnerStatus | null = null, command = '', copied = false, copyFailed = false, expires = 0, nextPoll = 0;
  const repo = o.repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(o.repo) && !o.repo.split('/').some(part => part === '.' || part === '..') ? o.repo : undefined;
  const api = `/api/repos/${repo}`;
  async function json<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await request(url, { cache: 'no-store', ...init });
    if (!response.ok) {
      if (response.status === 409) { const body = await response.json(); throw new Error(body.error || 'Finish the current work before starting another issue.'); }
      if (response.status === 429) throw new Error(`GitHub is taking a short pause. Try again in ${response.headers.get('retry-after') || 'a few'} seconds.`);
      if (response.status === 401) {
        login = true;
        let configured = true;
        try {
          const info = await request('/api/me', { cache: 'no-store' });
          if (info.ok) configured = (await info.json()).githubConfigured !== false;
        } catch { /* Keep the original authentication error when readiness is unavailable. */ }
        if (!configured) { login = false; throw new Error('GitHub setup is not finished on this server. The factory owner must connect its GitHub App before anyone can sign in.'); }
      }
      throw new Error(response.status === 401 ? 'Sign in with GitHub to connect your repository.' : response.status === 403 ? 'Access is unavailable. Check that the GitHub App is installed on this repo and that you have permission.' : 'Could not reach the factory. Try again.');
    }
    return response.json() as Promise<T>;
  }
  async function refresh() {
    if (!pane || busy || refreshing || pane === 'setup' || pane === 'disconnect') return;
    const current = revision, target = pane;
    refreshing = true; busy = !(target === 'power' && status); error = ''; login = false;
    try {
      if (target === 'repos') {
        // The front door is public. Ask who is here before requesting a protected inbox,
        // so an expected sign-in step does not produce a failed API request in the browser.
        if (!accountChecked) {
          const response = await request('/api/me', { cache: 'no-store' });
          if (!response.ok) throw new Error('Could not check sign-in. Try again.');
          const account = await response.json();
          if (current !== revision) return;
          if (account.guest === true || account.login === null) {
            login = account.githubConfigured !== false;
            throw new Error(login ? 'Sign in with GitHub to choose your repository.' : 'GitHub setup is not finished on this server. The factory owner must connect its GitHub App before anyone can sign in.');
          }
          accountChecked = true;
        }
        const data = await json<{ repos: Repo[]; nextPage?: number | null }>(`/api/repos?page=${page}`);
        if (current === revision) { repos = data.repos; nextPage = data.nextPage ?? null; index = Math.min(index, Math.max(0, repos.length - 1)); }
      } else if (target === 'issues') {
        const data = await json<{ issues: Issue[]; nextPage: number | null }>(`${api}/issues?page=${page}`);
        if (current === revision) { issues = data.issues; nextPage = data.nextPage; index = 0; }
      } else {
        const data = await json<RunnerStatus>(`${api}/runner/status`);
        if (current === revision) status = data;
      }
    } catch (e) { if (current === revision) error = e instanceof Error ? e.message : 'Could not load connection.'; }
    finally { if (current === revision) { busy = false; refreshing = false; nextPoll = now() + 5000; } }
  }
  function open(target: 'repo' | 'power') {
    if (pane === (target === 'repo' ? 'issues' : 'power') && !busy) { pane = null; revision++; return; }
    revision++; busy = false; refreshing = false; error = ''; login = false; index = 0; page = 1;
    pane = !repo ? 'repos' : target === 'repo' ? 'issues' : 'power';
    void refresh();
  }
  function card(): CardView | null {
    if (!pane) return null;
    let title = '', line = '', yes = 'Refresh', no = 'Close';
    if (busy) { title = pane === 'repos' ? 'Finding your repositories…' : pane === 'issues' ? 'Opening your inbox…' : 'Checking Codex…'; line = 'This should only take a moment.'; yes = 'Please wait…'; }
    else if (error) { title = login ? 'Sign in to your factory' : 'Connection needs attention'; line = login ? 'Sign in with GitHub so Shippy can see your repos. No coding starts yet.' : error; yes = login ? 'Sign in' : 'Try again'; }
    else if (pane === 'repos') {
      const r = repos[index]; title = r ? `Use ${r.fullName}?` : 'Connect your GitHub repo';
      line = r ? `${repos.length > 1 ? `Repository ${index + 1} of ${repos.length}. ` : ""}Shippy reads its issues and opens PRs here. Codex is next.` : 'Install the GitHub App so Shippy can read your issues. Then come back and refresh.';
      yes = r ? 'Use this repo' : nextPage ? 'More repos' : 'Connect GitHub'; no = r && (repos.length > 1 || nextPage || page > 1) ? 'Next repo' : 'Close';
    } else if (pane === 'issues') {
      const issue = issues[index]; title = issue ? `#${issue.number}: ${issue.title}` : 'No open issues on this page';
      line = issue ? `${repo} · ${index + 1} of ${issues.length}. ${issue.body ? `${issue.body.slice(0, 120).trim()}${issue.body.length > 120 ? '…' : ''} ` : ''}Review the plan before Codex starts.` : `Issues are what the factory builds. Add one to ${repo} on GitHub, then refresh.`;
      yes = issue ? 'Plan' : nextPage ? 'More issues' : 'Refresh'; no = issue ? 'Next issue' : 'Close';
    } else if (pane === 'setup') {
      title = copied ? 'Setup command copied' : 'Connect your Codex subscription';
      line = copyFailed ? `Copy this into Terminal: ${command}` : 'This links your computer so Codex can build here. Paste it into Terminal, then choose Check.';
      yes = copied ? 'Check' : 'Copy setup'; no = copied ? 'Copy setup' : 'Check';
    } else if (pane === 'disconnect') {
      title = 'Engine options'; line = 'Unplug this engine from the factory. Your Codex sign-in stays on your computer.'; yes = 'Unplug'; no = 'Close';
    } else {
      const ready = status?.online && status.harnesses.includes('codex');
      title = !status?.paired ? 'Connect your Codex engine' : !status.online ? 'Codex engine is offline' : !ready ? 'Sign in to Codex' : status.working ? 'Engine is busy' : 'Codex engine is ready';
      line = !status?.paired ? 'Codex writes the code on your computer, with your own subscription. Connecting starts no job.' : !status.online ? 'Run shiptorio-runner watch on your computer so the factory can hand Codex work.' : !ready ? 'Run shiptorio-runner login codex on your computer so Codex can write code for you.' : status.working ? `Working on ${status.working.title}.` : 'Codex is ready. Pick an issue so the factory has something to build.';
      yes = !status?.paired ? 'Set up Codex' : ready && !status.working ? 'Open inbox' : 'Refresh'; no = status?.paired ? 'Options' : 'Close';
    }
    return { id: `connection-${revision}-${displayRevision}-${pane}`, stop: pane === 'power' || pane === 'setup' || pane === 'disconnect' ? 'builder' : 'repo', title, line, yes, no, dots: null };
  }
  async function answer(id: string, approve: boolean) {
    if (!pane || card()?.id !== id) return false;
    const generation = revision;
    displayRevision++; // A refresh is a new card even when its content is unchanged.
    if (busy) return true;
    if (error && approve) {
      if (login) o.navigate(`/auth/login?next=${encodeURIComponent(o.path)}`); else if (pane === 'disconnect') { error = ''; } else { await refresh(); return true; }
      if (login) return true;
    }
    if (!approve) {
      if (pane === 'issues' && !error) {
        if (index + 1 < issues.length) { index++; revision++; }
        else { page = nextPage ?? 1; await refresh(); }
      }
      else if (pane === 'repos' && (repos.length > 1 || nextPage || page > 1)) {
        if (index + 1 < repos.length) { index++; revision++; }
        else { page = nextPage ?? 1; index = 0; await refresh(); }
      }
      else if (pane === 'setup') {
        if (copied && expires > now()) { try { await o.copy(command); copyFailed = false; } catch { copyFailed = true; } revision++; }
        else { pane = 'power'; revision++; await refresh(); }
      }
      else if (pane === 'power' && status?.paired) { pane = 'disconnect'; revision++; }
      else { pane = null; revision++; }
      return true;
    }
    if (pane === 'repos') {
      if (!repos[index] && nextPage) { page = nextPage; await refresh(); }
      else if (repos[index]) o.navigate(`${o.path.split('?')[0]}?source=live&repo=${encodeURIComponent(repos[index].fullName)}&onboard=codex`);
      else {
        busy = true;
        try {
          const me = await json<{ installUrl: string | null }>('/api/me');
          if (generation !== revision) return true;
          const url = me.installUrl ? new URL(me.installUrl) : null;
          if (url?.origin === 'https://github.com' && url.pathname.startsWith('/apps/')) o.navigate(url.href);
          else error = 'GitHub App setup is unavailable. Ask the factory owner to finish setup.';
        } catch (e) { if (generation === revision) error = e instanceof Error ? e.message : 'Could not open GitHub setup'; }
        finally { if (generation === revision) busy = false; }
      }
    } else if (pane === 'issues') {
      const issue = issues[index];
      if (!issue) { page = nextPage ?? 1; await refresh(); return true; }
      busy = true;
      try {
        await json(`${api}/issues/${issue.number}/start`, { method: 'POST' });
        if (generation === revision) { o.onStart?.(`gh-${issue.number}`); pane = null; revision++; }
      } catch (e) { if (generation === revision) error = e instanceof Error ? e.message : 'Could not start this issue.'; }
      finally { busy = false; }
    } else if (pane === 'power' && !status?.paired) {
      busy = true;
      try {
        const join = await json<{ join: string; expires: number }>(`${api}/runner/join`, { method: 'POST' });
        if (generation !== revision) return true;
        command = runnerInstallCommand(o.origin, join.join); expires = join.expires; copied = false; pane = 'setup'; busy = false; revision++;
      } catch (e) { if (generation === revision) error = e instanceof Error ? e.message : 'Setup failed'; }
      finally { if (generation === revision) busy = false; }
    } else if (pane === 'setup') {
      if (copied || expires <= now()) { pane = 'power'; revision++; await refresh(); }
      else { try { await o.copy(command); copied = true; copyFailed = false; } catch { copied = false; copyFailed = true; } revision++; }
    } else if (pane === 'disconnect') {
      busy = true;
      try { await json(`${api}/runner/disconnect`, { method: 'POST' }); if (generation !== revision) return true; pane = 'power'; busy = false; revision++; }
      catch (e) { if (generation === revision) error = e instanceof Error ? e.message : 'Disconnect failed'; }
      finally { if (generation === revision) busy = false; }
      if (generation + 1 === revision && !error) await refresh();
    } else if (pane === 'power' && status?.online && status.harnesses.includes('codex') && !status.working) {
      pane = 'issues'; revision++; index = 0; page = 1; await refresh();
    } else await refresh();
    return true;
  }
  if (repo && new URLSearchParams(o.path.split('?')[1]).get('onboard') === 'codex') open('power');
  return { open, answer, card, view(base: DeckView): DeckView {
    const c = card();
    return c ? { ...base, card: c, shippy: { at: c.stop, pose: 'inspect' } } : base;
  }, tick() { if (pane === 'power' && !busy && !error && now() >= nextPoll) void refresh(); } };
}
