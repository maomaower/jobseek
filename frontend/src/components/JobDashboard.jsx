import React, { useState, useEffect, useRef, useCallback } from 'react';
import JobCard from './JobCard';
import FilterSidebar from './FilterSidebar';

const API_URL = 'http://localhost:8000/api';
const WS_URL = 'ws://localhost:8000/ws';

const JobDashboard = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filters, setFilters] = useState({ source: 'All', search: '' });
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, sources: {} });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const ws = useRef(null);
  const observerRef = useRef(null);

  const fetchJobs = async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      
      const params = new URLSearchParams({ page: pageNum, limit: 30 });
      if (filters.source !== 'All') params.set('source', filters.source);
      if (filters.search) params.set('search', filters.search);
      
      const res = await fetch(`${API_URL}/jobs?${params}`);
      const data = await res.json();
      
      if (append) {
        setJobs(prev => [...prev, ...data.jobs]);
      } else {
        setJobs(data.jobs);
      }
      setTotalPages(data.pages);
      setTotalJobs(data.total);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  // Reset and refetch when filters change
  useEffect(() => {
    setPage(1);
    fetchJobs(1, false);
  }, [filters.source, filters.search]);

  useEffect(() => {
    fetchStats();

    // Setup WebSocket
    const connectWs = () => {
      ws.current = new WebSocket(WS_URL);
      
      ws.current.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
      };
      
      ws.current.onmessage = (event) => {
        const newJob = JSON.parse(event.data);
        console.log("New live job received:", newJob);
        setJobs(prevJobs => [newJob, ...prevJobs]);
        setStats(prev => ({
          total: prev.total + 1,
          sources: {
            ...prev.sources,
            [newJob.source]: (prev.sources[newJob.source] || 0) + 1
          }
        }));
      };
      
      ws.current.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        setTimeout(connectWs, 5000);
      };
    };

    connectWs();

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      await fetch(`${API_URL}/sync`, { method: 'POST' });
      // Jobs will arrive via WebSocket. Give it time, then also refresh the full list.
      setTimeout(async () => {
        await fetchJobs(1, false);
        await fetchStats();
        setIsSyncing(false);
      }, 10000);
    } catch (err) {
      console.error("Failed to sync jobs:", err);
      setIsSyncing(false);
    }
  };

  const loadMore = () => {
    if (page < totalPages && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchJobs(nextPage, true);
    }
  };

  // Infinite scroll observer
  const lastJobRef = useCallback(node => {
    if (loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && page < totalPages) {
        loadMore();
      }
    });
    if (node) observerRef.current.observe(node);
  }, [loadingMore, page, totalPages]);

  return (
    <div className="dashboard-layout">
      <aside>
        <div className="live-badge" style={{ 
          marginBottom: '1rem', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          color: isConnected ? 'var(--success)' : 'var(--text-secondary)' 
        }}>
          <div style={{
            width: '10px', 
            height: '10px', 
            borderRadius: '50%', 
            backgroundColor: isConnected ? 'var(--success)' : 'var(--text-secondary)',
            boxShadow: isConnected ? '0 0 8px var(--success)' : 'none',
            animation: isConnected ? 'pulse 2s infinite' : 'none'
          }}></div>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            {isConnected ? 'Live Stream Active' : 'Connecting...'}
          </span>
        </div>
        
        {/* Stats Panel */}
        <div className="glass-panel" style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, background: 'linear-gradient(135deg, var(--accent-color), var(--success))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {stats.total}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Jobs Available</div>
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {Object.entries(stats.sources).map(([source, count]) => (
              <div key={source} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{source}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        <FilterSidebar 
          filters={filters} 
          setFilters={setFilters} 
          onSync={handleSync} 
          isSyncing={isSyncing}
        />
      </aside>
      
      <main>
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Showing {jobs.length} of {totalJobs} jobs
          </span>
        </div>
        
        {loading && jobs.length === 0 ? (
          <div className="loader"><div className="spinner"></div></div>
        ) : jobs.length > 0 ? (
          <>
            <div className="jobs-grid">
              {jobs.map((job, index) => {
                if (index === jobs.length - 1) {
                  return <JobCard ref={lastJobRef} key={`${job.id}-${index}`} job={job} />;
                }
                return <JobCard key={`${job.id}-${index}`} job={job} />;
              })}
            </div>
            {loadingMore && (
              <div className="loader" style={{ height: '80px', marginTop: '1rem' }}>
                <div className="spinner"></div>
              </div>
            )}
            {page < totalPages && !loadingMore && (
              <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <button className="btn-primary" onClick={loadMore} style={{ width: 'auto', padding: '0.7rem 2rem' }}>
                  Load More Jobs
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="glass-panel empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', opacity: 0.5 }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <h2>No jobs found yet</h2>
            <p>Click <strong>"Sync All Sources"</strong> in the sidebar to fetch hundreds of real jobs from Remotive, RemoteOK & Arbeitnow!</p>
          </div>
        )}
      </main>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}} />
    </div>
  );
};

export default JobDashboard;
