import os
import json
import requests
import re
from pypdf import PdfReader

# Directory for storing PDFs
PDF_DIR = os.path.join(os.path.dirname(__file__), "vtu_pdfs")
os.makedirs(PDF_DIR, exist_ok=True)

# List of official VTU Scheme PDFs to download
VTU_SCHEME_PDFS = {
    # 2022 Scheme Common
    "2022_COMMON_CV_12": "https://vtu.ac.in/pdf/2022syll/cvsch.pdf",
    "2022_COMMON_CSE_12": "https://vtu.ac.in/pdf/2022syll/csesch.pdf",
    "2022_COMMON_EEE_12": "https://vtu.ac.in/pdf/2022syll/elecsch.pdf",
    "2022_COMMON_ME_12": "https://vtu.ac.in/pdf/2022syll/mechsch.pdf",
    # 2022 Scheme Branches
    "2022_CS_38": "https://vtu.ac.in/pdf/2022_3to8/38csesch.pdf",
    "2022_AI_38": "https://vtu.ac.in/pdf/2022_3to8/38aimlsch.pdf",
    "2022_CV_34": "https://vtu.ac.in/pdf/2022_3to8/civsch.pdf",
    "2022_CV_58": "https://vtu.ac.in/pdf/2022_3to8/58civsch.pdf",
    "2022_DS_38": "https://vtu.ac.in/pdf/2022_3to8/38csedssch.pdf",
    "2022_EC_34": "https://vtu.ac.in/pdf/2022_3to8/ecesch.pdf",
    "2022_EC_58": "https://vtu.ac.in/pdf/2022_3to8/5ecesch.pdf",
    "2022_EC_6": "https://vtu.ac.in/pdf/2022_3to8/6ecesch.pdf",
    "2022_EC_78": "https://vtu.ac.in/pdf/2022_3to8/7ecesch.pdf",
    "2022_EE_34": "https://vtu.ac.in/pdf/2022_3to8/34eesch.pdf",
    "2022_EE_58": "https://vtu.ac.in/pdf/2022_3to8/58eesch.pdf",
    "2022_ME_34": "https://vtu.ac.in/pdf/2022_3to8/mecsch.pdf",
    "2022_ME_58": "https://vtu.ac.in/pdf/2022_3to8/58mecsch.pdf",
    "2022_RI_34": "https://vtu.ac.in/pdf/2022_3to8/raisch.pdf",
    "2022_RI_56": "https://vtu.ac.in/pdf/2022_3to8/56raisch.pdf",
    "2022_RI_78": "https://vtu.ac.in/pdf/2022_3to8/78raisch.pdf",

    # 2025 Scheme Common
    "2025_COMMON_PHY_12": "https://vtu.ac.in/pdf/UG2024/phycyc.pdf",
    "2025_COMMON_CHEM_12": "https://vtu.ac.in/pdf/UG2024/chemcyc.pdf",
    # 2025 Scheme Branches
    "2025_CS_34": "https://vtu.ac.in/pdf/2025syll3to8/34csesch.pdf",
    "2025_AI_34": "https://vtu.ac.in/pdf/2025syll3to8/34aimlsch.pdf",
    "2025_CV_34": "https://vtu.ac.in/pdf/2025syll3to8/34civilsch.pdf",
    "2025_DS_34": "https://vtu.ac.in/pdf/2025syll3to8/34csdssch.pdf",
    "2025_EC_34": "https://vtu.ac.in/pdf/2025syll3to8/34ecsch.pdf",
    "2025_EE_34": "https://vtu.ac.in/pdf/2025syll3to8/34eeesch.pdf",
    "2025_ME_34": "https://vtu.ac.in/pdf/2025syll3to8/34mecsch.pdf",
    "2025_RI_34": "https://vtu.ac.in/pdf/2025syll3to8/34raisch.pdf",
    "2025_TEMPLATE_38": "https://vtu.ac.in/wp-content/uploads/2026/08/2025-3-8-sem-BE-BTech-Scheme-Engg-V9-11.08.2026.pdf"
}

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

print("=== DOWNLOADING OFFICIAL VTU SCHEME PDFS ===")
for name, url in VTU_SCHEME_PDFS.items():
    file_path = os.path.join(PDF_DIR, f"{name}.pdf")
    if not os.path.exists(file_path):
        print(f"Downloading {name} from {url}...")
        try:
            r = requests.get(url, headers=headers, timeout=30)
            if r.status_code == 200:
                with open(file_path, "wb") as f:
                    f.write(r.content)
                print(f"  [SUCCESS] Saved {name}.pdf ({len(r.content)} bytes)")
            else:
                print(f"  [FAILED] {name}: HTTP {r.status_code}")
        except Exception as e:
            print(f"  [ERROR] Error downloading {name}: {e}")
    else:
        print(f"  [CACHED] Already cached {name}.pdf")

print("\nAll downloads processed.")
