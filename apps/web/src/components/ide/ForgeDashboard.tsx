'use client';
import { useState, useEffect, useCallback } from 'react';

interface ForgeStats {
  distillation: {
    total_samples: number;
    high_value: number;
    exported: number;
    by_model: Record<string, number>;
    by_outcome: Record<string, number>;
  };
  harvest: {
    total: number;
    approved: number;
    migrated: number;
    rejected: number;
    pending: number;
    bySource: Record<string, number>;
    recentBatches: Array<{
      id: string;
      source: string;
      status: string;
      total_scraped: number;
      passed_filter: number;
    }>;
  };
}

interface HarvestJob {
  status: 'idle' | 'scraping' | 'filtering' | 'complete' | 'error';
  message: string;
  progress?: { scraped: number; filtered: number; saved: number; aiRejected?: number };
}

export function ForgeDashboard() {
  const [stats, setStats] = useState<ForgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [harvestJob, setHarvestJob] = useState<HarvestJob>({ status: 'idle', message: '' });
  const [harvestSource, setHarvestSource] = useState<string>('all');
  const [harvestTopic, setHarvestTopic] = useState<string>('');
  const [harvestLimit, setHarvestLimit] = useState<number>(20);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/forge/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // best effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const startHarvest = async () => {
    setHarvestJob({ status: 'scraping', message: 'Starting harvest...' });
    try {
      const res = await fetch('/api/forge/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: harvestSource,
          topic: harvestTopic || 'all',
          limit: harvestLimit,
        }),
      });

      if (!res.ok) {
        setHarvestJob({ status: 'error', message: `API error: ${res.status}` });
        return;
      }

      const data = await res.json();
      setHarvestJob({
        status: 'complete',
        message: `Harvest complete!`,
        progress: {
          scraped: data.total_input,
          filtered: data.after_pass4,
          saved: data.saved,
          aiRejected: data.ai_rejected || 0,
        },
      });

      fetchStats();
    } catch (err) {
      setHarvestJob({ status: 'error', message: `Failed: ${(err as Error).message}` });
    }
  };

  const sectionStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: '1px solid #3c3c3c',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#cccccc',
    marginBottom: '10px',
  };

  const statCardStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
  };

  const statLabelStyle: React.CSSProperties = {
    color: '#999',
    fontSize: '12px',
  };

  const statValueStyle: React.CSSProperties = {
    color: '#4fc3f7',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'monospace',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  };

  const harvestButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: harvestJob.status === 'scraping' || harvestJob.status === 'filtering'
      ? '#555' : '#0e639c',
    color: '#fff',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    background: '#3c3c3c',
    border: '1px solid #555',
    borderRadius: '3px',
    color: '#ccc',
    fontSize: '12px',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const,
  };

  const progressBarBg: React.CSSProperties = {
    width: '100%',
    height: '4px',
    background: '#333',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '4px',
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', color: '#999', textAlign: 'center', fontSize: '12px' }}>
        Loading Forge stats...
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', color: '#cccccc', fontSize: '12px' }}>
      {/* Header */}
      <div style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#4fc3f7">
          <path d="M8 1L2 4v4l6 3 6-3V4L8 1zm0 1.5L12.5 5 8 7.5 3.5 5 8 2.5zM3 5.5l5 2.5v4.5l-5-2.5V5.5zm10 0v4.5l-5 2.5V8l5-2.5z"/>
        </svg>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Forge Dashboard</span>
      </div>

      {/* Distillation Stats */}
      <div style={sectionStyle}>
        <div style={headingStyle}>Distillation Pipeline</div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Total Samples</span>
          <span style={statValueStyle}>{stats?.distillation.total_samples?.toLocaleString() || '0'}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>High Value (7+)</span>
          <span style={{ ...statValueStyle, color: '#66bb6a' }}>{stats?.distillation.high_value?.toLocaleString() || '0'}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Exported</span>
          <span style={statValueStyle}>{stats?.distillation.exported?.toLocaleString() || '0'}</span>
        </div>
        {stats?.distillation.by_model && Object.keys(stats.distillation.by_model).length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ ...statLabelStyle, marginBottom: '4px' }}>By Model:</div>
            {Object.entries(stats.distillation.by_model).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([model, count]) => (
              <div key={model} style={{ ...statCardStyle, padding: '2px 0 2px 12px' }}>
                <span style={{ ...statLabelStyle, fontSize: '11px' }}>{model.split('/').pop()}</span>
                <span style={{ ...statValueStyle, fontSize: '11px' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Harvest Stats */}
      <div style={sectionStyle}>
        <div style={headingStyle}>Harvest (Web Scraper)</div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Total Harvested</span>
          <span style={statValueStyle}>{stats?.harvest.total?.toLocaleString() || '0'}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Pending Review</span>
          <span style={{ ...statValueStyle, color: '#ffa726' }}>{stats?.harvest.pending?.toLocaleString() || '0'}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Approved</span>
          <span style={{ ...statValueStyle, color: '#66bb6a' }}>{stats?.harvest.approved?.toLocaleString() || '0'}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Rejected</span>
          <span style={{ ...statLabelStyle }}>{stats?.harvest.rejected?.toLocaleString() || '0'}</span>
        </div>
        {stats?.harvest.bySource && Object.keys(stats.harvest.bySource).length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ ...statLabelStyle, marginBottom: '4px' }}>By Source:</div>
            {Object.entries(stats.harvest.bySource).map(([src, count]) => (
              <div key={src} style={{ ...statCardStyle, padding: '2px 0 2px 12px' }}>
                <span style={{ ...statLabelStyle, fontSize: '11px' }}>{src}</span>
                <span style={{ ...statValueStyle, fontSize: '11px' }}>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Harvest Controls */}
      <div style={sectionStyle}>
        <div style={headingStyle}>Start Harvest</div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ ...statLabelStyle, display: 'block', marginBottom: '3px' }}>Source</label>
          <select
            style={selectStyle}
            value={harvestSource}
            onChange={(e) => setHarvestSource(e.target.value)}
          >
            <option value="all">All Sources (Web + Datasets)</option>
            <option value="github">GitHub (Top Repos)</option>
            <option value="stackoverflow">Stack Overflow</option>
            <option value="docs">Official Docs</option>
            <option value="blog">Engineering Blogs</option>
            <option value="dataset">Public Datasets (FineWeb, Stack, Pile, CodeSearchNet)</option>
          </select>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <label style={{ ...statLabelStyle, display: 'block', marginBottom: '3px' }}>Topic</label>
          <input
            style={inputStyle}
            placeholder="e.g. React hooks, TypeScript generics..."
            value={harvestTopic}
            onChange={(e) => setHarvestTopic(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: '10px' }}>
          <label style={{ ...statLabelStyle, display: 'block', marginBottom: '3px' }}>
            Limit: {harvestLimit} items
          </label>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={harvestLimit}
            onChange={(e) => setHarvestLimit(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#0e639c' }}
          />
        </div>

        <button
          style={harvestButtonStyle}
          onClick={startHarvest}
          disabled={harvestJob.status === 'scraping' || harvestJob.status === 'filtering'}
        >
          {harvestJob.status === 'scraping' ? (
            <>Scraping...</>
          ) : harvestJob.status === 'filtering' ? (
            <>Filtering...</>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1a6 6 0 110 12A6 6 0 018 2zm-.5 3v3.5H4v1h3.5V13h1V9.5H12v-1H8.5V5h-1z"/>
              </svg>
              Start Harvest
            </>
          )}
        </button>

        {/* Progress / Result */}
        {harvestJob.status !== 'idle' && (
          <div style={{ marginTop: '10px', padding: '8px', background: '#252526', borderRadius: '4px' }}>
            {(harvestJob.status === 'scraping' || harvestJob.status === 'filtering') && (
              <div style={progressBarBg}>
                <div style={{
                  width: harvestJob.status === 'scraping' ? '40%' : '80%',
                  height: '100%',
                  background: '#0e639c',
                  borderRadius: '2px',
                  transition: 'width 0.5s ease',
                }} />
              </div>
            )}
            <div style={{
              color: harvestJob.status === 'error' ? '#f44336'
                : harvestJob.status === 'complete' ? '#66bb6a'
                : '#999',
              fontSize: '11px',
              marginTop: '6px',
            }}>
              {harvestJob.message}
            </div>
            {harvestJob.progress && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ ...statCardStyle, padding: '2px 0' }}>
                  <span style={{ ...statLabelStyle, fontSize: '11px' }}>Scraped</span>
                  <span style={{ ...statValueStyle, fontSize: '11px' }}>{harvestJob.progress.scraped}</span>
                </div>
                {harvestJob.progress.aiRejected !== undefined && harvestJob.progress.aiRejected > 0 && (
                  <div style={{ ...statCardStyle, padding: '2px 0' }}>
                    <span style={{ ...statLabelStyle, fontSize: '11px', color: '#f44336' }}>AI Content Blocked</span>
                    <span style={{ ...statValueStyle, fontSize: '11px', color: '#f44336' }}>{harvestJob.progress.aiRejected}</span>
                  </div>
                )}
                <div style={{ ...statCardStyle, padding: '2px 0' }}>
                  <span style={{ ...statLabelStyle, fontSize: '11px' }}>Passed All Filters</span>
                  <span style={{ ...statValueStyle, fontSize: '11px' }}>{harvestJob.progress.filtered}</span>
                </div>
                <div style={{ ...statCardStyle, padding: '2px 0' }}>
                  <span style={{ ...statLabelStyle, fontSize: '11px' }}>Saved to DB</span>
                  <span style={{ ...statValueStyle, fontSize: '11px', color: '#66bb6a' }}>{harvestJob.progress.saved}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Batches */}
      {stats?.harvest.recentBatches && stats.harvest.recentBatches.length > 0 && (
        <div style={sectionStyle}>
          <div style={headingStyle}>Recent Batches</div>
          {stats.harvest.recentBatches.slice(0, 5).map((batch: any) => (
            <div key={batch.id} style={{
              padding: '6px 8px',
              marginBottom: '4px',
              background: '#252526',
              borderRadius: '3px',
              fontSize: '11px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#ccc' }}>{batch.source}</span>
                <span style={{
                  color: batch.status === 'completed' ? '#66bb6a' : batch.status === 'running' ? '#ffa726' : '#f44336',
                  fontWeight: 600,
                }}>{batch.status}</span>
              </div>
              <div style={{ color: '#777', marginTop: '2px' }}>
                Scraped: {batch.total_scraped} | Passed: {batch.passed_filter}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
