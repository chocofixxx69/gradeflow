import sys
import json
import os
import re

sys.path.append('backend')
from scrape_syllabus import CATALOG_2022, CATALOG_2025

branch_map = {
    'CS': 'CSE', 'CI': 'AIML', 'CD': 'DS', 'IS': 'ISE',
    'EC': 'ECE', 'EE': 'EEE', 'ME': 'ME', 'CV': 'CIVIL',
    'AD': 'AIML', 'DS': 'DS', 'RI': 'AIML', 'Common': 'COMMON'
}

data_dict = {}

for scheme, catalog in [('2022', CATALOG_2022), ('2025', CATALOG_2025)]:
    for code, name, cred, sem, branch in catalog:
        b_key = branch_map.get(branch, branch)
        if sem <= 2:
            b_key = f'{scheme}_COMMON'
        
        if b_key not in data_dict: data_dict[b_key] = {}
        if str(sem) not in data_dict[b_key]: data_dict[b_key][str(sem)] = []
        
        data_dict[b_key][str(sem)].append({'code': code, 'name': name, 'credits': cred})

# Deduplicate based on code because CS/IS etc. might add the same common semester courses multiple times
for b_key, sems in data_dict.items():
    for sem_key, subs in sems.items():
        unique_subs = []
        seen_codes = set()
        for s in subs:
            if s['code'] not in seen_codes:
                unique_subs.append(s)
                seen_codes.add(s['code'])
        data_dict[b_key][sem_key] = unique_subs

parsed_json = json.dumps(data_dict, indent=4)

with open('lib/vtuGrades.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# Replace export const VTU_SUBJECT_DATA = {}; or an already filled version
js_content = re.sub(r'export const VTU_SUBJECT_DATA\s*=\s*\{[\s\S]*?\};', f'export const VTU_SUBJECT_DATA = {parsed_json};', js_content, flags=re.DOTALL)

with open('lib/vtuGrades.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print('Successfully injected VTU_SUBJECT_DATA into vtuGrades.js')
