"""
live_worker.py — Real-time GradeFlow Scraper Worker

This script polls the Supabase queue every few seconds. 
Whenever you tap 'Fetch' on the website, this worker will 
automatically see the new job and start scraping immediately.
"""

import time
import sys
import os

# Fix import path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

from scraper.process_queue import process_queued_jobs

def run_live_worker(interval=5):
    print("=" * 60)
    print("  GradeFlow LIVE Worker — Active & Listening")
    print("  Status: Monitoring Supabase queue every 5s...")
    print("  (Press Ctrl+C to stop)")
    print("=" * 60)
    
    try:
        while True:
            # Process up to 5 jobs at a time
            processed = process_queued_jobs(limit=5, quiet=True)
            
            if processed > 0:
                print(f"\n  [WORKER] Cycle complete. Processed {processed} jobs.")
                print("  [WORKER] Resuming monitor...")
            
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n\n  [WORKER] Shutting down gracefully...")
        sys.exit(0)

if __name__ == "__main__":
    # Ensure dependencies are available
    try:
        import playwright
    except ImportError:
        print("❌ Error: Playwright not installed. Run 'pip install playwright' first.")
        sys.exit(1)
        
    run_live_worker()
