import time
import os
import datetime

# --- CONFIGURATION ---
# Change this to the path where your old hard drive is mounted.
# Windows Example: "D:\\keepalive.txt" (Use double backslashes)
# Mac/Linux Example: "/Volumes/OldDrive/keepalive.txt"
FILE_PATH = "D:\\keepalive.txt" 

# Adjust this based on how fast your drive goes to sleep. 
# 60 to 120 seconds is usually a safe bet.
INTERVAL_SECONDS = 60 

def keep_drive_awake():
    print(f"Starting keep-awake script for {FILE_PATH}...")
    print(f"Writing to drive every {INTERVAL_SECONDS} seconds. Press Ctrl+C to stop.")
    
    while True:
        try:
            # Open the file and overwrite it with the current time
            with open(FILE_PATH, "w") as f:
                current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                f.write(f"Keep awake ping: {current_time}\n")
                
                # CRITICAL: This forces the OS to write to the physical disk, 
                # bypassing the system's RAM cache.
                f.flush()
                os.fsync(f.fileno())
                
            print(f"[{current_time}] Ping successful.")
            
        except Exception as e:
            # If the drive disconnected anyway, this catches the error so the script doesn't crash
            print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] Error writing to drive: {e}")
            
        # Wait for the next cycle
        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    keep_drive_awake()