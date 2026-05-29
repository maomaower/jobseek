from fastapi import FastAPI, BackgroundTasks, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import sqlite3
import logging
import json
import asyncio
import requests
import time
import hashlib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="JobSeeq API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error sending message: {e}")

manager = ConnectionManager()

class JobPosting(BaseModel):
    id: int
    title: str
    company: str
    location: str
    link: str
    date_posted: str
    source: str
    description: Optional[str] = None
    job_type: Optional[str] = None
    salary: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = 'new'

def init_db():
    conn = sqlite3.connect('jobs.db')
    c = conn.cursor()
    # We no longer drop the table to preserve user data (saved jobs)
    # c.execute("DROP TABLE IF EXISTS jobs")
    c.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT,
            link TEXT UNIQUE NOT NULL,
            date_posted TEXT,
            source TEXT NOT NULL,
            description TEXT,
            job_type TEXT,
            salary TEXT,
            tags TEXT,
            status TEXT DEFAULT 'new'
        )
    ''')
    # Migrate existing database to add status column if it doesn't exist
    try:
        c.execute("ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'new'")
    except sqlite3.OperationalError:
        pass # Column already exists
    conn.commit()
    conn.close()

init_db()

# ──────────────────────────────────────────────────────
# REAL JOB API SCRAPERS
# ──────────────────────────────────────────────────────

def make_link_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()

def scrape_remotive():
    """Fetch jobs from Remotive API - hundreds of remote jobs"""
    jobs = []
    try:
        resp = requests.get("https://remotive.com/api/remote-jobs", timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for item in data.get("jobs", []):
            jobs.append({
                "title": item.get("title", "Untitled"),
                "company": item.get("company_name", "Unknown"),
                "location": item.get("candidate_required_location", "Remote"),
                "link": item.get("url", ""),
                "date_posted": item.get("publication_date", datetime.now().isoformat()),
                "source": "Remotive",
                "description": (item.get("description", "") or "")[:500],
                "job_type": item.get("job_type", ""),
                "salary": item.get("salary", ""),
                "tags": ", ".join(item.get("tags", []))
            })
        logger.info(f"Remotive: fetched {len(jobs)} jobs")
    except Exception as e:
        logger.error(f"Remotive scrape failed: {e}")
    return jobs

def scrape_arbeitnow():
    """Fetch jobs from Arbeitnow API"""
    jobs = []
    try:
        # Fetch multiple pages
        for page in range(1, 4):
            resp = requests.get(f"https://www.arbeitnow.com/api/job-board-api?page={page}", timeout=15)
            resp.raise_for_status()
            data = resp.json()
            for item in data.get("data", []):
                jobs.append({
                    "title": item.get("title", "Untitled"),
                    "company": item.get("company_name", "Unknown"),
                    "location": item.get("location", "Remote"),
                    "link": item.get("url", ""),
                    "date_posted": item.get("created_at", datetime.now().isoformat()),
                    "source": "Arbeitnow",
                    "description": (item.get("description", "") or "")[:500],
                    "job_type": "Remote" if item.get("remote", False) else "On-site",
                    "salary": "",
                    "tags": ", ".join(item.get("tags", []))
                })
            if not data.get("links", {}).get("next"):
                break
            time.sleep(0.5)
        logger.info(f"Arbeitnow: fetched {len(jobs)} jobs")
    except Exception as e:
        logger.error(f"Arbeitnow scrape failed: {e}")
    return jobs

def scrape_remoteok():
    """Fetch jobs from RemoteOK API"""
    jobs = []
    try:
        headers = {"User-Agent": "JobSeeq/1.0"}
        resp = requests.get("https://remoteok.com/api", headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        # First item is metadata, skip it
        for item in data[1:]:
            tags = item.get("tags", [])
            if isinstance(tags, list):
                tags_str = ", ".join(tags)
            else:
                tags_str = str(tags)
            jobs.append({
                "title": item.get("position", "Untitled"),
                "company": item.get("company", "Unknown"),
                "location": item.get("location", "Remote"),
                "link": item.get("url", ""),
                "date_posted": item.get("date", datetime.now().isoformat()),
                "source": "RemoteOK",
                "description": (item.get("description", "") or "")[:500],
                "job_type": "Remote",
                "salary": "",
                "tags": tags_str
            })
        logger.info(f"RemoteOK: fetched {len(jobs)} jobs")
    except Exception as e:
        logger.error(f"RemoteOK scrape failed: {e}")
    return jobs

def insert_jobs(jobs_list):
    """Insert jobs into the database, skipping duplicates"""
    conn = sqlite3.connect('jobs.db')
    c = conn.cursor()
    inserted = 0
    new_jobs = []
    for job in jobs_list:
        if not job.get("link"):
            continue
        try:
            c.execute('''
                INSERT INTO jobs (title, company, location, link, date_posted, source, description, job_type, salary, tags, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
            ''', (
                job["title"], job["company"], job["location"], job["link"],
                job["date_posted"], job["source"], job.get("description", ""),
                job.get("job_type", ""), job.get("salary", ""), job.get("tags", "")
            ))
            job["id"] = c.lastrowid
            new_jobs.append(job)
            inserted += 1
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    conn.close()
    logger.info(f"Inserted {inserted} new jobs out of {len(jobs_list)} scraped")
    return new_jobs

# ──────────────────────────────────────────────────────
# WEBSOCKET
# ──────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ──────────────────────────────────────────────────────
# API ENDPOINTS
# ──────────────────────────────────────────────────────

@app.get("/api/jobs")
def get_jobs(
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    source: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    conn = sqlite3.connect('jobs.db')
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    query = "SELECT * FROM jobs WHERE 1=1"
    params = []

    if source and source != "All":
        query += " AND source = ?"
        params.append(source)

    if search:
        query += " AND (title LIKE ? OR company LIKE ? OR tags LIKE ?)"
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param])

    # Get total count
    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    c.execute(count_query, params)
    total = c.fetchone()[0]

    # Paginated results
    offset = (page - 1) * limit
    query += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    c.execute(query, params)
    rows = c.fetchall()
    conn.close()

    return {
        "jobs": [dict(row) for row in rows],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if limit > 0 else 1
    }

class JobStatusUpdate(BaseModel):
    status: str

@app.patch("/api/jobs/{job_id}/status")
def update_job_status(job_id: int, status_update: JobStatusUpdate):
    valid_statuses = ["new", "saved", "applied", "rejected"]
    if status_update.status not in valid_statuses:
        return {"error": "Invalid status"}
        
    conn = sqlite3.connect('jobs.db')
    c = conn.cursor()
    c.execute("UPDATE jobs SET status = ? WHERE id = ?", (status_update.status, job_id))
    conn.commit()
    conn.close()
    return {"message": f"Job {job_id} status updated to {status_update.status}"}

@app.get("/api/stats")
def get_stats():
    conn = sqlite3.connect('jobs.db')
    c = conn.cursor()
    c.execute("SELECT source, COUNT(*) FROM jobs GROUP BY source")
    sources = {row[0]: row[1] for row in c.fetchall()}
    c.execute("SELECT COUNT(*) FROM jobs")
    total = c.fetchone()[0]
    conn.close()
    return {"total": total, "sources": sources}

async def run_full_scrape():
    """Run all scrapers and broadcast new jobs via WebSocket"""
    logger.info("Starting full scrape from all sources...")
    
    all_jobs = []
    all_jobs.extend(scrape_remotive())
    all_jobs.extend(scrape_arbeitnow())
    all_jobs.extend(scrape_remoteok())

    new_jobs = insert_jobs(all_jobs)
    
    # Broadcast each new job via WebSocket
    for job in new_jobs[:50]:  # Broadcast first 50 to avoid flooding
        await manager.broadcast(json.dumps(job))
        await asyncio.sleep(0.1)
    
    logger.info(f"Full scrape complete. {len(new_jobs)} new jobs added.")

def start_scraping_sync():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run_full_scrape())
    loop.close()

@app.post("/api/sync")
def sync_jobs(background_tasks: BackgroundTasks):
    background_tasks.add_task(start_scraping_sync)
    return {"message": "Scraping started from Remotive, RemoteOK, Arbeitnow..."}

# ──────────────────────────────────────────────────────
# BACKGROUND SCHEDULER
# ──────────────────────────────────────────────────────
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()

@scheduler.scheduled_job('interval', hours=1)
def scheduled_scrape():
    logger.info("Running scheduled hourly scrape...")
    start_scraping_sync()

@app.on_event("startup")
def startup_event():
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()
