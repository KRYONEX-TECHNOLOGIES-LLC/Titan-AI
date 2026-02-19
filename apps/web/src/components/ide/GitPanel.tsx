'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicted: string[];
  deleted: string[];
  renamed: { from: string; to: string }[];
  isClean: boolean;
  remoteUrl: string | null;
}

interface DiffHunk {
  header: string;
  lines: { type: 'add' | 'remove' | 'context'; content: string }[];
}

interface DiffFile {
  from: string;
  to: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

interface Branch {
  name: string;
  current: boolean;
  sha: string;
  remote: boolean;
}

interface Props {
  workspacePath?: string;
}

const POLL_INTERVAL = 5000;

export default function GitPanel({ workspacePath }: Props) {
  const { data: session } = useSession();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [diffFiles, setDiffFiles] = useState<DiffFile[]>([]);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((text: string, type: 'success' | 'error') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const res = await fetch(`/api/git/status?path=${encodeURIComponent(workspacePath)}`);
      if (res.ok) {
        const data = await res.json() as GitStatus;
        setStatus(data);
      }
    } catch { /* silently fail during polling */ }
  }, [workspacePath]);

  const fetchBranches = useCallback(async () => {
    if (!workspacePath) return;
    try {
      const res = await fetch(`/api/git/branches?path=${encodeURIComponent(workspacePath)}`);
      if (res.ok) {
        const data = await res.json() as { all: Branch[] };
        setBranches(data.all ?? []);
      }
    } catch { /* ignore */ }
  }, [workspacePath]);

  const fetchDiff = useCallback(async (file: string, staged = false) => {
    if (!workspacePath) return;
    try {
      const params = new URLSearchParams({ path: workspacePath, file, staged: staged.toString() });
      const res = await fetch(`/api/git/diff?${params}`);
      if (res.ok) {
        const data = await res.json() as { files: DiffFile[] };
        setDiffFiles(data.files);
      }
    } catch { /* ignore */ }
  }, [workspacePath]);

  // Poll for status
  useEffect(() => {
    if (!workspacePath) return;
    fetchStatus();
    fetchBranches();

    pollRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [workspacePath, fetchStatus, fetchBranches]);

  // Close branch dropdown on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setShowBranchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const stageFile = async (file: string) => {
    if (!workspacePath) return;
    setLoading(true);
    try {
      await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, message: '__stage_only__', files: [file] }),
      });
      // Just stage, don't commit — use a workaround via git add through status
      await fetchStatus();
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const stageAll = async () => {
    if (!workspacePath || !status) return;
    setLoading(true);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Stage all but don't commit yet — we send empty message and catch on server
        body: JSON.stringify({ path: workspacePath, message: '__stage_only__' }),
      });
      if (!res.ok) throw new Error();
      await fetchStatus();
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!workspacePath || !commitMessage.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, message: commitMessage }),
      });
      const data = await res.json() as { hash?: string; error?: string };
      if (!res.ok) throw new Error(data.error);
      setCommitMessage('');
      showToast(`Committed ${data.hash?.slice(0, 7)}`, 'success');
      await fetchStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Commit failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const push = async () => {
    if (!workspacePath) return;
    setPushing(true);
    try {
      const res = await fetch('/api/git/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, setUpstream: (status?.ahead ?? 0) > 0 }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error);
      showToast('Pushed successfully', 'success');
      await fetchStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Push failed', 'error');
    } finally {
      setPushing(false);
    }
  };

  const pull = async () => {
    if (!workspacePath) return;
    setPulling(true);
    try {
      const res = await fetch('/api/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath }),
      });
      const data = await res.json() as { success?: boolean; files?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error);
      showToast(`Pulled — ${data.files?.length ?? 0} file(s) updated`, 'success');
      await fetchStatus();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Pull failed', 'error');
    } finally {
      setPulling(false);
    }
  };

  const checkoutBranch = async (name: string) => {
    if (!workspacePath) return;
    try {
      const res = await fetch('/api/git/branches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, name }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      showToast(`Switched to ${name}`, 'success');
      setShowBranchDropdown(false);
      await Promise.all([fetchStatus(), fetchBranches()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Checkout failed', 'error');
    }
  };

  const createBranch = async () => {
    if (!workspacePath || !newBranchName.trim()) return;
    try {
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, name: newBranchName.trim(), checkout: true }),
      });
      if (!res.ok) throw new Error('Create branch failed');
      showToast(`Created and switched to ${newBranchName}`, 'success');
      setNewBranchName('');
      setShowNewBranch(false);
      await Promise.all([fetchStatus(), fetchBranches()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create branch', 'error');
    }
  };

  // If no workspace
  if (!workspacePath) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#666] px-4 text-center">
        <div className="text-4xl mb-3 opacity-20">⎇</div>
        <div className="text-[13px]">No folder open</div>
        <div className="text-[11px] text-[#555] mt-1">Open a folder or clone a repo to see git status</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#666] px-4 text-center">
        <div className="text-4xl mb-3 opacity-20">🔒</div>
        <div className="text-[13px]">Sign in required</div>
        <div className="text-[11px] text-[#555] mt-1 mb-4">Sign in with GitHub to use git features</div>
        <a href="/auth/signin" className="px-3 py-1.5 bg-[#007acc] text-white rounded text-[12px] hover:bg-[#005a99]">
          Sign in with GitHub
        </a>
      </div>
    );
  }

  if (status && !status.isRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#666] px-4 text-center">
        <div className="text-4xl mb-3 opacity-20">📁</div>
        <div className="text-[13px]">Not a git repository</div>
        <div className="text-[11px] text-[#555] mt-1">This folder is not a git repository</div>
      </div>
    );
  }

  const totalChanges = (status?.staged.length ?? 0) + (status?.modified.length ?? 0) + (status?.untracked.length ?? 0);
  const canCommit = (status?.staged.length ?? 0) > 0 && commitMessage.trim().length > 0;
  const localBranches = branches.filter(b => !b.remote);

  return (
    <div className="h-full flex flex-col overflow-hidden text-[13px] relative">
      {/* Toast */}
      {toastMsg && (
        <div className={`absolute top-2 left-2 right-2 z-50 px-3 py-2 rounded text-[12px] font-medium ${toastMsg.type === 'success' ? 'bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/30' : 'bg-[#f85149]/20 text-[#f85149] border border-[#f85149]/30'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* Header: Branch + Push/Pull */}
      <div className="px-3 py-2 border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-2 mb-2">
          {/* Branch selector */}
          <div ref={branchRef} className="relative flex-1">
            <button
              onClick={() => setShowBranchDropdown(!showBranchDropdown)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-[#2d2d2d] hover:bg-[#3c3c3c] rounded text-[12px] text-[#cccccc] border border-[#3c3c3c]"
            >
              <span className="text-[#3fb950]">⎇</span>
              <span className="flex-1 text-left truncate">{status?.branch ?? '...'}</span>
              {(status?.ahead ?? 0) > 0 && (
                <span className="text-[10px] text-[#3fb950]">↑{status?.ahead}</span>
              )}
              {(status?.behind ?? 0) > 0 && (
                <span className="text-[10px] text-[#f85149]">↓{status?.behind}</span>
              )}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 6l4 4 4-4z"/>
              </svg>
            </button>

            {showBranchDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2d2d] border border-[#3c3c3c] rounded shadow-xl z-50 overflow-hidden">
                <div className="max-h-[200px] overflow-y-auto">
                  {localBranches.map(b => (
                    <button
                      key={b.name}
                      onClick={() => checkoutBranch(b.name)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[#3c3c3c] ${b.current ? 'text-[#007acc]' : 'text-[#cccccc]'}`}
                    >
                      {b.current && <span className="text-[#007acc]">✓</span>}
                      <span className={b.current ? 'ml-0' : 'ml-4'}>{b.name}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#3c3c3c]">
                  <button
                    onClick={() => { setShowNewBranch(true); setShowBranchDropdown(false); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#007acc] hover:bg-[#3c3c3c]"
                  >
                    + New branch
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Push/Pull */}
          <button
            onClick={pull}
            disabled={pulling}
            title="Pull from remote"
            className="p-1.5 hover:bg-[#3c3c3c] rounded text-[#808080] hover:text-[#cccccc] disabled:opacity-50"
          >
            {pulling ? (
              <div className="w-4 h-4 border border-[#808080] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1v8M4 6l4 3 4-3M2 13h12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
            )}
          </button>
          <button
            onClick={push}
            disabled={pushing || (status?.ahead ?? 0) === 0}
            title={`Push ${status?.ahead ?? 0} commit(s)`}
            className="p-1.5 hover:bg-[#3c3c3c] rounded text-[#808080] hover:text-[#cccccc] disabled:opacity-50"
          >
            {pushing ? (
              <div className="w-4 h-4 border border-[#808080] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 15V7M4 10l4-3 4 3M2 3h12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>

        {/* New branch input */}
        {showNewBranch && (
          <div className="flex items-center gap-1 mt-1">
            <input
              autoFocus
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createBranch(); if (e.key === 'Escape') setShowNewBranch(false); }}
              placeholder="New branch name..."
              className="flex-1 px-2 py-1 bg-[#1e1e1e] border border-[#007acc] rounded text-[12px] text-[#cccccc] outline-none"
            />
            <button onClick={createBranch} className="px-2 py-1 bg-[#007acc] text-white rounded text-[12px]">
              Create
            </button>
          </div>
        )}
      </div>

      {/* Commit area */}
      <div className="px-3 py-2 border-b border-[#3c3c3c] shrink-0">
        <textarea
          value={commitMessage}
          onChange={e => setCommitMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(); }}
          placeholder="Message (Ctrl+Enter to commit)"
          className="w-full bg-[#1e1e1e] border border-[#3c3c3c] focus:border-[#007acc] rounded px-2 py-1.5 text-[12px] text-[#cccccc] resize-none outline-none h-[56px]"
        />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={stageAll}
            disabled={loading || totalChanges === 0}
            title="Stage all changes"
            className="flex-1 py-1 bg-[#2d2d2d] hover:bg-[#3c3c3c] disabled:opacity-40 rounded text-[11px] text-[#cccccc] border border-[#3c3c3c]"
          >
            Stage All
          </button>
          <button
            onClick={commit}
            disabled={loading || !canCommit}
            className="flex-1 py-1 bg-[#007acc] hover:bg-[#005a99] disabled:opacity-40 disabled:cursor-not-allowed rounded text-[11px] text-white font-medium"
          >
            {loading ? 'Committing...' : `Commit ${status?.staged.length ? `(${status.staged.length})` : ''}`}
          </button>
        </div>
      </div>

      {/* File lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged */}
        {(status?.staged.length ?? 0) > 0 && (
          <FileSection
            title={`Staged (${status!.staged.length})`}
            files={status!.staged}
            color="#3fb950"
            badge="A"
            workspacePath={workspacePath}
            onFileClick={(f) => { setSelectedDiffFile(f); fetchDiff(f, true); }}
            selectedFile={selectedDiffFile}
          />
        )}

        {/* Modified */}
        {(status?.modified.length ?? 0) > 0 && (
          <FileSection
            title={`Modified (${status!.modified.length})`}
            files={status!.modified}
            color="#e3b341"
            badge="M"
            workspacePath={workspacePath}
            onFileClick={(f) => { setSelectedDiffFile(f); fetchDiff(f, false); }}
            selectedFile={selectedDiffFile}
          />
        )}

        {/* Untracked */}
        {(status?.untracked.length ?? 0) > 0 && (
          <FileSection
            title={`Untracked (${status!.untracked.length})`}
            files={status!.untracked}
            color="#808080"
            badge="U"
            workspacePath={workspacePath}
            onFileClick={(f) => { setSelectedDiffFile(f); fetchDiff(f, false); }}
            selectedFile={selectedDiffFile}
          />
        )}

        {/* Conflicted */}
        {(status?.conflicted.length ?? 0) > 0 && (
          <FileSection
            title={`Conflicts (${status!.conflicted.length})`}
            files={status!.conflicted}
            color="#f85149"
            badge="C"
            workspacePath={workspacePath}
            onFileClick={(f) => { setSelectedDiffFile(f); fetchDiff(f, false); }}
            selectedFile={selectedDiffFile}
          />
        )}

        {/* Deleted */}
        {(status?.deleted.length ?? 0) > 0 && (
          <FileSection
            title={`Deleted (${status!.deleted.length})`}
            files={status!.deleted}
            color="#f85149"
            badge="D"
            workspacePath={workspacePath}
            onFileClick={(f) => { setSelectedDiffFile(f); }}
            selectedFile={selectedDiffFile}
          />
        )}

        {status?.isClean && (
          <div className="px-4 py-6 text-center text-[#555] text-[12px]">
            No changes — working tree clean
          </div>
        )}

        {/* Diff viewer */}
        {selectedDiffFile && diffFiles.length > 0 && (
          <DiffViewer files={diffFiles} onClose={() => { setSelectedDiffFile(null); setDiffFiles([]); }} />
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function FileSection({
  title, files, color, badge, workspacePath, onFileClick, selectedFile
}: {
  title: string;
  files: string[];
  color: string;
  badge: string;
  workspacePath: string;
  onFileClick: (f: string) => void;
  selectedFile: string | null;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-[#2a2a2a]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#808080] hover:bg-[#2a2a2a]"
      >
        <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <path d="M6 4l4 4-4 4z"/>
        </svg>
        {title}
      </button>
      {expanded && (
        <div>
          {files.map(file => {
            const name = file.split('/').pop() ?? file;
            const dir = file.split('/').slice(0, -1).join('/');
            return (
              <button
                key={file}
                onClick={() => onFileClick(file)}
                className={`w-full flex items-center gap-2 px-4 py-1 text-[12px] hover:bg-[#2a2a2a] ${selectedFile === file ? 'bg-[#37373d]' : ''}`}
              >
                <span className="font-bold text-[10px] px-1 rounded" style={{ color, backgroundColor: `${color}20` }}>
                  {badge}
                </span>
                <span className="text-[#cccccc] flex-1 text-left truncate">{name}</span>
                {dir && <span className="text-[#555] text-[10px] truncate max-w-[80px]">{dir}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DiffViewer({ files, onClose }: { files: DiffFile[]; onClose: () => void }) {
  const [activeFile, setActiveFile] = useState(0);
  const file = files[activeFile];

  return (
    <div className="border-t-2 border-[#007acc]/30 bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2 overflow-x-auto">
          {files.map((f, i) => (
            <button
              key={f.to}
              onClick={() => setActiveFile(i)}
              className={`text-[11px] px-2 py-0.5 rounded shrink-0 ${activeFile === i ? 'bg-[#3c3c3c] text-white' : 'text-[#808080] hover:text-white'}`}
            >
              {f.to.split('/').pop()}
              <span className="ml-1 text-[#3fb950]">+{f.additions}</span>
              <span className="ml-0.5 text-[#f85149]">-{f.deletions}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="text-[#808080] hover:text-white ml-2 text-[14px]">×</button>
      </div>
      {file && (
        <div className="max-h-[300px] overflow-y-auto font-mono text-[11px]">
          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              <div className="px-3 py-1 text-[#007acc] bg-[#007acc]/5 text-[10px]">{hunk.header}</div>
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  className={`px-3 py-px whitespace-pre ${
                    line.type === 'add' ? 'bg-[#3fb950]/10 text-[#3fb950]' :
                    line.type === 'remove' ? 'bg-[#f85149]/10 text-[#f85149]' :
                    'text-[#666]'
                  }`}
                >
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}{line.content}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
