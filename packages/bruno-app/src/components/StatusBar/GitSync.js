import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { IconGitPullRequest, IconRefresh } from '@tabler/icons';
import ToolHint from 'components/ToolHint';

// Lower-toolbar quick git sync.
//
// Only renders when `preferences.general.defaultLocation` resolves to a
// directory inside a git repository. Clicking runs the
// renderer:git-quick-sync IPC, which performs a fast-forward-only pull then
// a push of the upstream-tracked branch.
//
// All sync logic lives in the main process (bruno-electron/utils/git.js);
// this component is just a button + toast.
const GitSync = () => {
  const defaultLocation = useSelector(
    (state) => state?.app?.preferences?.general?.defaultLocation || ''
  );

  const [repo, setRepo] = useState({ isRepo: false });
  const [syncing, setSyncing] = useState(false);
  // Lets us ignore the result of an in-flight probe if defaultLocation
  // changes again before it returns.
  const probeTokenRef = useRef(0);

  useEffect(() => {
    const token = ++probeTokenRef.current;
    if (!defaultLocation) {
      setRepo({ isRepo: false });
      return;
    }
    window?.ipcRenderer
      ?.invoke('renderer:git-check-path', { path: defaultLocation })
      .then((result) => {
        if (token !== probeTokenRef.current) return;
        setRepo(result && result.isRepo ? result : { isRepo: false });
      })
      .catch(() => {
        if (token !== probeTokenRef.current) return;
        setRepo({ isRepo: false });
      });
  }, [defaultLocation]);

  if (!repo.isRepo) return null;

  const reprobe = () => {
    const token = ++probeTokenRef.current;
    window?.ipcRenderer
      ?.invoke('renderer:git-check-path', { path: defaultLocation })
      .then((result) => {
        if (token !== probeTokenRef.current) return;
        setRepo(result && result.isRepo ? result : { isRepo: false });
      })
      .catch(() => {});
  };

  const runSync = (discardLocalChanges = false) =>
    window.ipcRenderer.invoke('renderer:git-quick-sync', {
      path: defaultLocation,
      discardLocalChanges
    });

  // Confirms with the user that they really want to throw away their
  // uncommitted edits before retrying with discardLocalChanges:true. We use
  // window.confirm intentionally: it's blocking and unmistakeable, which
  // matches the cost of the action ("specifically asked"). Bruno's react
  // toasts can't do a proper synchronous confirm.
  const confirmDiscard = (dirty) => {
    const counts = [];
    if (dirty?.staged > 0) counts.push(`${dirty.staged} staged`);
    if (dirty?.modified > 0) counts.push(`${dirty.modified} modified`);
    if (dirty?.deleted > 0) counts.push(`${dirty.deleted} deleted`);
    if (dirty?.not_added > 0) counts.push(`${dirty.not_added} untracked`);
    const summary = counts.length ? counts.join(', ') : 'uncommitted changes';
    const sample = Array.isArray(dirty?.files) && dirty.files.length
      ? `\n\nFiles include:\n  • ${dirty.files.slice(0, 8).join('\n  • ')}${dirty.files.length > 8 ? '\n  • …' : ''}`
      : '';
    return window.confirm(
      `Overwrite local changes?\n\n`
      + `You have ${summary} in this repository. Continuing will discard them `
      + `permanently (git reset --hard + git clean -fd) and accept the `
      + `incoming version from upstream.${sample}\n\n`
      + `This cannot be undone. Continue?`
    );
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      let result = await runSync(false);

      // If the only blocker was a dirty working tree, give the user a single
      // explicit chance to overwrite their local changes and retry.
      if (result && !result.ok && result.code === 'dirty-working-tree') {
        if (confirmDiscard(result.dirty)) {
          result = await runSync(true);
        }
      }

      if (result?.ok) {
        toast.success(describeSuccess(result, repo.branch));
      } else {
        const { text, duration } = describeFailure(result);
        toast.error(text, { duration });
      }
    } catch (err) {
      toast.error(`Git sync failed: ${err?.message || 'unknown error'}`, { duration: 8000 });
    } finally {
      setSyncing(false);
      reprobe();
    }
  };

  const label = `Git sync (${repo.branch})`;

  return (
    <ToolHint text={label} toolhintId="GitSync" place="top" offset={10}>
      <button
        className="status-bar-button"
        data-trigger="git-sync"
        onClick={handleSync}
        disabled={syncing}
        tabIndex={0}
        aria-label={label}
      >
        {syncing ? (
          <IconRefresh size={16} strokeWidth={1.5} className="git-sync-spin" aria-hidden="true" />
        ) : (
          <IconGitPullRequest size={16} strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>
    </ToolHint>
  );
};

const describeSuccess = (result, branch) => {
  const where = branch ? ` on ${branch}` : '';
  const prefix = result.discarded ? 'Local changes discarded. ' : '';
  switch (result.code) {
    case 'up-to-date': return `${prefix}Already up to date${where}.`;
    case 'pulled': return `${prefix}Pulled ${result.pulled} commit${result.pulled === 1 ? '' : 's'}${where}.`;
    case 'pushed': return `${prefix}Pushed ${result.pushed} commit${result.pushed === 1 ? '' : 's'}${where}.`;
    case 'synced': return `${prefix}Synced${where}: pulled ${result.pulled}, pushed ${result.pushed}.`;
    default: return `${prefix}Synced${where}.`;
  }
};

// Each failure code gets a labelled, actionable message. Toast durations are
// scaled to how long the user needs to copy commands / switch tools:
//   - manual-merge: 30s — they'll go run git commands elsewhere
//   - no-upstream:  12s — copying the `git push -u` example
//   - everything else: 8s
// react-hot-toast 2.x doesn't dismiss-on-click by default in this codebase,
// so we avoid Infinity (would otherwise stay forever).
const describeFailure = (result) => {
  const fallback = result?.message || 'Git sync failed.';
  switch (result?.code) {
    case 'requires-manual-merge':
      return {
        text: `Merge required — ${result.message || 'your branch has diverged from upstream.'} Resolve the merge in your git tool (e.g. \`git pull\` then \`git merge\` / \`git rebase\`), commit, then try sync again.`,
        duration: 30000
      };
    case 'dirty-working-tree':
      return { text: `Working tree has uncommitted changes — ${result.message || 'commit or stash before syncing.'}`, duration: 8000 };
    case 'no-upstream':
      return { text: `No upstream branch — ${result.message || 'set one before syncing.'}`, duration: 12000 };
    case 'no-remote':
      return { text: `No remote configured — ${result.message || 'add one and set the upstream first.'}`, duration: 8000 };
    case 'not-a-repo':
      return { text: `Not a git repository — ${result.message || 'the default location isn\'t inside a git repo.'}`, duration: 6000 };
    case 'error':
    default:
      return { text: `Git sync failed: ${fallback}`, duration: 8000 };
  }
};

export default GitSync;
