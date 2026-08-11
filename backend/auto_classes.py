import sys
import os
import re
from collections import defaultdict
import uuid

# Ensure scraper module can be found
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper.config import supabase

def map_branch(usn):
    if len(usn) < 7:
        return 'UNKNOWN'
    branch_code = usn[5:7].upper()
    return branch_code

def main():
    print("Fetching all scraped students...")
    # Get all students
    response = supabase.table("students").select("id, usn, branch, semester").execute()
    students = response.data
    
    if not students:
        print("No students found.")
        return
        
    print(f"Found {len(students)} students.")
    
    # Group students by (branch_code, semester) -> "CS 3rd Year" etc.
    # Sem 5 and Sem 6 = 3rd Year. (Assuming year = ceil(sem/2))
    groups = defaultdict(list)
    
    for s in students:
        usn = s.get('usn', '')
        branch_code = map_branch(usn)
        sem = s.get('semester') or 1
        # Determine Year based on USN batch: 2AB23CS013 -> 23 means 2023
        try:
            batch_yr = int(usn[3:5]) + 2000
            # Rough proxy for current year, since it's 2026 right now:
            year = 2026 - batch_yr
            if year <= 1: year_str = "1st Year"
            elif year == 2: year_str = "2nd Year"
            elif year == 3: year_str = "3rd Year"
            elif year == 4: year_str = "4th Year"
            else: year_str = f"{year}th Year"
        except:
            # Fallback
            year_str = "Unknown Year"
        
        # Class Name format: "AITM CS 3rd Year"
        class_name = f"AITM {branch_code} {year_str}"
        groups[class_name].append(s)
        
    print(f"Grouped into {len(groups)} potential classes.")
    
    for class_name, studs in groups.items():
        if len(studs) == 0: continue
        
        print(f"\nProcessing class: {class_name} with {len(studs)} students...")
        
        # Extract metadata from one student
        sample = studs[0]
        schema = "2022"  # default
        sem = sample.get('semester') or 1
        branch = sample.get('branch') or "Engineering"
        
        existing_class_res = supabase.table("classes").select("id").eq("name", class_name).execute()
        
        if existing_class_res.data:
            class_id = existing_class_res.data[0]['id']
            print(f"  Class '{class_name}' already exists.")
        else:
            # Create the class
            print(f"  Creating new class '{class_name}'...")
            new_class_data = {
                "name": class_name,
                "branch": branch,
                "semester": sem,
                "scheme": schema
            }
            res = supabase.table("classes").insert(new_class_data).execute()
            class_id = res.data[0]['id']
            
        # Add students to class_students
        print(f"  Adding/Ensuring {len(studs)} students are in class mapping...")
        existing_studs_res = supabase.table("class_students").select("usn").eq("class_id", class_id).execute()
        existing_usns = {x['usn'] for x in existing_studs_res.data}
        
        new_mappings = []
        for s in studs:
            usn = s['usn']
            if usn not in existing_usns:
                new_mappings.append({
                    "class_id": class_id,
                    "usn": usn
                })
        
        if new_mappings:
            supabase.table("class_students").insert(new_mappings).execute()
            print(f"  Added {len(new_mappings)} new students to '{class_name}'.")
        else:
            print(f"  All students already mapped in '{class_name}'.")

    print("\n✅ Auto-class generation complete.")

if __name__ == "__main__":
    main()
