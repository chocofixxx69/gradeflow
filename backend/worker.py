import time
import subprocess
import sys
import os

def start_worker():
    print("=" * 60)
    print("  GradeFlow Real-time Scraper — Live Logs Active")
    print("  Ready to process requests from the portal...")
    print("=" * 60)
    print("  [Press Ctrl+C to stop]")
    
    try:
        while True:
            # We run the process_queue script directly without capturing output
            # This allows it to stream its own logs (Processing USN, Captcha, etc.) 
            # straight to your terminal in real-time.
            subprocess.run([sys.executable, "-m", "scraper.process_queue", "--quiet"])
            
            # Wait 5 seconds before checking the database again
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\n  Worker stopped by user.")
    except Exception as e:
        print(f"\n  Worker encountered an unexpected error: {e}")

if __name__ == "__main__":
    start_worker()
