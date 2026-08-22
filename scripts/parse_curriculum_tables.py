import os
import json
import re
import pdfplumber

PDF_DIR = os.path.join(os.path.dirname(__file__), "vtu_pdfs")

# Mapping of PDF files to Scheme, Branch, Semesters, Source URL
PDF_MAPPINGS = [
    # 2022 Scheme Common Sem 1-2
    {"file": "2022_COMMON_CSE_12.pdf", "scheme": "2022", "branches": ["CS", "AI", "DS"], "semesters": [1, 2], "url": "https://vtu.ac.in/pdf/2022syll/csesch.pdf"},
    {"file": "2022_COMMON_CV_12.pdf", "scheme": "2022", "branches": ["CV"], "semesters": [1, 2], "url": "https://vtu.ac.in/pdf/2022syll/cvsch.pdf"},
    {"file": "2022_COMMON_EEE_12.pdf", "scheme": "2022", "branches": ["EC", "EE"], "semesters": [1, 2], "url": "https://vtu.ac.in/pdf/2022syll/elecsch.pdf"},
    {"file": "2022_COMMON_ME_12.pdf", "scheme": "2022", "branches": ["ME", "RI"], "semesters": [1, 2], "url": "https://vtu.ac.in/pdf/2022syll/mechsch.pdf"},

    # 2022 Scheme Branches Sem 3-8
    {"file": "2022_CS_38.pdf", "scheme": "2022", "branches": ["CS"], "semesters": [3, 4, 5, 6, 7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/38csesch.pdf"},
    {"file": "2022_AI_38.pdf", "scheme": "2022", "branches": ["AI"], "semesters": [3, 4, 5, 6, 7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/38aimlsch.pdf"},
    {"file": "2022_DS_38.pdf", "scheme": "2022", "branches": ["DS"], "semesters": [3, 4, 5, 6, 7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/38csedssch.pdf"},
    {"file": "2022_CV_34.pdf", "scheme": "2022", "branches": ["CV"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2022_3to8/civsch.pdf"},
    {"file": "2022_CV_58.pdf", "scheme": "2022", "branches": ["CV"], "semesters": [5, 6, 7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/58civsch.pdf"},
    {"file": "2022_EC_34.pdf", "scheme": "2022", "branches": ["EC"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2022_3to8/ecesch.pdf"},
    {"file": "2022_EC_58.pdf", "scheme": "2022", "branches": ["EC"], "semesters": [5, 6, 7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/5ecesch.pdf"},
    {"file": "2022_EE_34.pdf", "scheme": "2022", "branches": ["EE"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2022_3to8/34eesch.pdf"},
    {"file": "2022_EE_58.pdf", "scheme": "2022", "branches": ["EE"], "semesters": [5, 6, 7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/58eesch.pdf"},
    {"file": "2022_ME_34.pdf", "scheme": "2022", "branches": ["ME"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2022_3to8/mecsch.pdf"},
    {"file": "2022_ME_58.pdf", "scheme": "2022", "branches": ["ME"], "semesters": [5, 6, 7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/58mecsch.pdf"},
    {"file": "2022_RI_34.pdf", "scheme": "2022", "branches": ["RI"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2022_3to8/raisch.pdf"},
    {"file": "2022_RI_56.pdf", "scheme": "2022", "branches": ["RI"], "semesters": [5, 6], "url": "https://vtu.ac.in/pdf/2022_3to8/56raisch.pdf"},
    {"file": "2022_RI_78.pdf", "scheme": "2022", "branches": ["RI"], "semesters": [7, 8], "url": "https://vtu.ac.in/pdf/2022_3to8/78raisch.pdf"},

    # 2025 Scheme Common Sem 1-2
    {"file": "2025_COMMON_PHY_12.pdf", "scheme": "2025", "branches": ["CS", "AI", "DS", "EC", "EE", "CV", "ME", "RI"], "semesters": [1, 2], "url": "https://vtu.ac.in/pdf/UG2024/phycyc.pdf"},
    {"file": "2025_COMMON_CHEM_12.pdf", "scheme": "2025", "branches": ["CS", "AI", "DS", "EC", "EE", "CV", "ME", "RI"], "semesters": [1, 2], "url": "https://vtu.ac.in/pdf/UG2024/chemcyc.pdf"},

    # 2025 Scheme Branches Sem 3-4
    {"file": "2025_CS_34.pdf", "scheme": "2025", "branches": ["CS"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34csesch.pdf"},
    {"file": "2025_AI_34.pdf", "scheme": "2025", "branches": ["AI"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34aimlsch.pdf"},
    {"file": "2025_DS_34.pdf", "scheme": "2025", "branches": ["DS"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34csdssch.pdf"},
    {"file": "2025_CV_34.pdf", "scheme": "2025", "branches": ["CV"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34civilsch.pdf"},
    {"file": "2025_EC_34.pdf", "scheme": "2025", "branches": ["EC"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34ecsch.pdf"},
    {"file": "2025_EE_34.pdf", "scheme": "2025", "branches": ["EE"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34eeesch.pdf"},
    {"file": "2025_ME_34.pdf", "scheme": "2025", "branches": ["ME"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34mecsch.pdf"},
    {"file": "2025_RI_34.pdf", "scheme": "2025", "branches": ["RI"], "semesters": [3, 4], "url": "https://vtu.ac.in/pdf/2025syll3to8/34raisch.pdf"},
    {"file": "2025_TEMPLATE_38.pdf", "scheme": "2025", "branches": ["CS", "AI", "DS", "EC", "EE", "CV", "ME", "RI"], "semesters": [3, 4, 5, 6, 7, 8], "url": "https://vtu.ac.in/wp-content/uploads/2026/08/2025-3-8-sem-BE-BTech-Scheme-Engg-V9-11.08.2026.pdf"}
]

print("Mapping table built with", len(PDF_MAPPINGS), "configurations.")
