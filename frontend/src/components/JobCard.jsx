import React, { forwardRef } from 'react';

const JobCard = forwardRef(({ job }, ref) => {
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  return (
    <a ref={ref} href={job.link} target="_blank" rel="noopener noreferrer" className="glass-panel job-card">
      <div>
        <div className="company">{job.company}</div>
        <h3 className="title">{job.title}</h3>
        
        <div className="details">
          <div className="details-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span>{job.location || 'Remote'}</span>
          </div>
          {job.job_type && (
            <div className="details-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
              </svg>
              <span>{job.job_type}</span>
            </div>
          )}
        </div>

        {job.tags && (
          <div className="tags-container">
            {job.tags.split(', ').filter(Boolean).slice(0, 4).map((tag, i) => (
              <span key={i} className="tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      
      <div className="footer">
        <span>{formatDate(job.date_posted)}</span>
        <span className="source-badge">{job.source}</span>
      </div>
    </a>
  );
});

JobCard.displayName = 'JobCard';

export default JobCard;
