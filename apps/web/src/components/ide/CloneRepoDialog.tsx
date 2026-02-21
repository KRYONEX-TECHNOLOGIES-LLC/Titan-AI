'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from '@/providers/session-provider';

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  cloneUrl: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  updatedAt: string;
  owner: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCloneComplete: (path: string, repoName: string) => void;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f7df1e', Python: '#3572A5',
  Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', 'C#': '#178600',
  'C++': '#f34b7d', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
};

export default function CloneRepoDialog({ isOpen, onClose, onCloneComplete }: Props) {
  const { user: sessionUser } = useSession();
  const session = sessionUser ? { user: sessionUser } : null;
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filtered, setFiltered] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloningRepo, setCloningRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'stars'>('updated');
  const [typeFilter, setTypeFilter] = useState<'all' | 'owner' | 'fork'>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchRepos = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/repos?type=all&sort=updated&per_page=100');
      if (!res.ok) throw new Error('Failed to load repositories');
      const data = await res.json() as { repos: GitHubRepo[] };
      setRepos(data.repos);
      setFiltered(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repos');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (isOpen && session) {
      fetchRepos();
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, session, fetchRepos]);

  // Filter + sort
  useEffect(() => {
    let result = [...repos];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q)
      );
    }

    if (typeFilter === 'owner') result = result.filter(r => !r.fork);
    if (typeFilter === 'fork') result = result.filter(r => r.fork);

    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stars') return b.stars - a.stars;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    setFiltered(result);
  }, [repos, search, sortBy, typeFilter]);

  const cloneRepo = async (repo: GitHubRepo) => {
    setCloning(true);
    setCloningRepo(repo.fullName);
    setError(null);

    try {
      const res = await fetch('/api/repos/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloneUrl: repo.cloneUrl,
          repoName: repo.name,
          repoOwner: repo.owner,
          defaultBranch: repo.defaultBranch,
        }),
      });

      const data = await res.json() as { path?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Clone failed');

      onCloneComplete(data.path!, repo.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setCloning(false);
      setCloningRepo(null);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-[640px] max-h-[80vh] bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3c3c]">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Clone Repository</h2>
            {session?.user && (
              <p className="text-[12px] text-[#808080] mt-0.5">
                Signed in as{' '}
                <span className="text-[#cccccc]">@{session?.user?.username}</span>
                {' '}— {repos.length} repositories
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[#808080] hover:text-white text-[20px] leading-none">×</button>
        </div>

        {/* Sign-in prompt */}
        {!session && (
          <div className="flex-1 flex flex-col items-center justify-center py-12">
            <div className="text-4xl mb-4">🔒</div>
            <p className="text-[#808080] text-[14px] mb-4">Sign in to access your repositories</p>
            <a href="/auth/signin" className="px-4 py-2 bg-[#007acc] text-white rounded text-[13px] hover:bg-[#005a99]">
              Sign in with GitHub
            </a>
          </div>
        )}

        {session && (
          <>
            {/* Search + filters */}
            <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center gap-2">
              <div className="flex-1 relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#2d2d2d] border border-[#3c3c3c] focus:border-[#007acc] rounded text-[13px] text-[#cccccc] outline-none placeholder-[#555]"
                />
              </div>

              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as 'all' | 'owner' | 'fork')}
                className="px-2 py-1.5 bg-[#2d2d2d] border border-[#3c3c3c] rounded text-[12px] text-[#cccccc] outline-none"
              >
                <option value="all">All</option>
                <option value="owner">Mine</option>
                <option value="fork">Forks</option>
              </select>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'updated' | 'name' | 'stars')}
                className="px-2 py-1.5 bg-[#2d2d2d] border border-[#3c3c3c] rounded text-[12px] text-[#cccccc] outline-none"
              >
                <option value="updated">Recently updated</option>
                <option value="name">Name</option>
                <option value="stars">Stars</option>
              </select>
            </div>

            {/* Repo list */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-[#007acc] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {error && (
                <div className="px-4 py-3 m-4 bg-[#f85149]/10 border border-[#f85149]/30 rounded text-[#f85149] text-[12px]">
                  {error}
                </div>
              )}

              {!loading && filtered.length === 0 && !error && (
                <div className="py-12 text-center text-[#555] text-[13px]">
                  {search ? 'No repositories match your search' : 'No repositories found'}
                </div>
              )}

              {filtered.map(repo => (
                <div
                  key={repo.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-[#2a2a2a] hover:bg-[#2a2a2a] group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[#cccccc] truncate">{repo.fullName}</span>
                      {repo.private && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#3c3c3c] text-[#808080] rounded-full border border-[#555] shrink-0">
                          Private
                        </span>
                      )}
                      {repo.fork && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-[#3c3c3c] text-[#808080] rounded-full border border-[#555] shrink-0">
                          Fork
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-[11px] text-[#555] mt-0.5 truncate">{repo.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {repo.language && (
                        <span className="flex items-center gap-1 text-[10px] text-[#808080]">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: LANG_COLORS[repo.language] ?? '#808080' }}
                          />
                          {repo.language}
                        </span>
                      )}
                      {repo.stars > 0 && (
                        <span className="text-[10px] text-[#808080]">★ {repo.stars}</span>
                      )}
                      <span className="text-[10px] text-[#555]">Updated {timeAgo(repo.updatedAt)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => cloneRepo(repo)}
                    disabled={cloning}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#007acc] hover:bg-[#005a99] disabled:opacity-50 text-white rounded text-[12px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {cloningRepo === repo.fullName ? (
                      <>
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        Cloning...
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/>
                        </svg>
                        Clone
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Cloning overlay */}
        {cloning && (
          <div className="absolute inset-0 bg-[#1e1e1e]/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
            <div className="w-10 h-10 border-2 border-[#007acc] border-t-transparent rounded-full animate-spin mb-4" />
            <div className="text-[14px] text-white font-medium">Cloning {cloningRepo}...</div>
            <div className="text-[12px] text-[#808080] mt-1">This may take a moment</div>
          </div>
        )}
      </div>
    </div>
  );
}
