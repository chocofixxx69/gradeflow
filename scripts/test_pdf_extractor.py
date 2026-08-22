import os
import pdfplumber
import re

PDF_DIR = os.path.join(os.path.dirname(__file__), "vtu_pdfs")

# Test on 2022_CS_38.pdf
test_pdf = os.path.join(PDF_DIR, "2022_CS_38.pdf")

with pdfplumber.open(test_pdf) as pdf:
    print(f"Total pages in 2022_CS_38.pdf: {len(pdf.pages)}")
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        tables = page.extract_tables()
        print(f"\n--- Page {i+1} --- (Tables found: {len(tables)})")
        if tables:
            for t_idx, tbl in enumerate(tables):
                print(f"Table {t_idx+1}:")
                for row in tbl[:10]:
                    cleaned_row = [re.sub(r'\s+', ' ', str(c or '')).strip() for c in row]
                    print("  ", cleaned_row)
        else:
            lines = text.split("\n")
            for l in lines[:10]:
                print("  [Text]", l)
