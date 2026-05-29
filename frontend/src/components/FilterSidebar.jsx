import React from 'react';

const FilterSidebar = ({ filters, setFilters, onSync, isSyncing }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="glass-panel filter-section">
      <h3>Filter Jobs</h3>
      
      <div className="filter-group">
        <label htmlFor="source">Platform</label>
        <select name="source" id="source" value={filters.source} onChange={handleChange}>
          <option value="All">All Platforms</option>
          <option value="Remotive">Remotive</option>
          <option value="RemoteOK">RemoteOK</option>
          <option value="Arbeitnow">Arbeitnow</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="status">Status</label>
        <select name="status" id="status" value={filters.status || 'All'} onChange={handleChange}>
          <option value="All">All Jobs</option>
          <option value="new">New Jobs</option>
          <option value="saved">Saved Jobs</option>
          <option value="applied">Applied</option>
          <option value="rejected">Hidden/Rejected</option>
        </select>
      </div>
      
      <div className="filter-group">
        <label htmlFor="search">Search Keywords</label>
        <input 
          type="text" 
          id="search" 
          name="search" 
          placeholder="e.g. React, Python, Marketing" 
          value={filters.search}
          onChange={handleChange}
        />
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button 
          className="btn-primary" 
          onClick={onSync} 
          disabled={isSyncing}
          style={{ opacity: isSyncing ? 0.7 : 1, cursor: isSyncing ? 'not-allowed' : 'pointer' }}
        >
          {isSyncing ? '⏳ Syncing All Sources...' : '🔄 Sync All Sources'}
        </button>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', textAlign: 'center' }}>
          Fetches real jobs from Remotive, RemoteOK & Arbeitnow.
        </p>
      </div>
    </div>
  );
};

export default FilterSidebar;
