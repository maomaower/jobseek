export interface Job {
  id: string;
  company: string;
  title: string;
  link: string;
  location?: string;
  job_type?: string;
  tags?: string;
  date_posted: string;
  source: string;
  status: 'new' | 'saved' | 'applied' | 'rejected';
}
