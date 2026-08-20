import cv2
import numpy as np
import re
import sys
import gc

# Memory-optimized OCR solver for 512MB RAM cloud environments (Render Free)
reader = None
dddd_ocr = None

def get_ddddocr():
    global dddd_ocr
    if dddd_ocr is None:
        try:
            import ddddocr
            print("[CAPTCHA] Initializing ddddocr (Ultra-lightweight engine)...", file=sys.stderr)
            dddd_ocr = ddddocr.DdddOcr(show_ad=False)
        except Exception as e:
            dddd_ocr = False
    return dddd_ocr if dddd_ocr is not False else None

def get_easyocr():
    global reader
    if reader is None:
        try:
            import torch
            torch.set_num_threads(1)
            import easyocr
            print("[CAPTCHA] Initializing EasyOCR Engine...", file=sys.stderr)
            reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        except Exception as e:
            print(f"[CAPTCHA] Failed to load EasyOCR: {e}", file=sys.stderr)
    return reader

def preprocess_image(image_bytes: bytes):
    """Clean the image for OCR"""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None: return None
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    upscaled = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)
    
    _, thresh = cv2.threshold(upscaled, 140, 255, cv2.THRESH_BINARY)
    return thresh

def clean_ocr_result(text: str) -> str:
    """Standard Alphanumeric sanitize."""
    if not text: return ""
    clean = re.sub(r'[^A-Za-z0-9]', '', text)
    if len(clean) > 6: clean = clean[:6]
    return clean

def solve_captcha(image_bytes: bytes) -> str:
    """Solve VTU captcha using ddddocr (low RAM) with EasyOCR fallback"""
    # 1. Try ultra-lightweight ddddocr first (~15MB RAM)
    try:
        ocr_light = get_ddddocr()
        if ocr_light:
            res = ocr_light.classification(image_bytes)
            clean = clean_ocr_result(res)
            if len(clean) == 6:
                print(f"[CAPTCHA] ddddocr Success: '{clean}'", file=sys.stderr)
                return clean
    except Exception as e:
        pass

    # 2. Try pytesseract (very low memory C++ engine)
    try:
        import pytesseract
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_bytes))
        txt = pytesseract.image_to_string(img, config='--psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
        clean = clean_ocr_result(txt)
        if len(clean) == 6:
            print(f"[CAPTCHA] Pytesseract Success: '{clean}'", file=sys.stderr)
            return clean
    except Exception:
        pass

    # 3. EasyOCR fallback (PyTorch)
    try:
        processed = preprocess_image(image_bytes)
        if processed is None: return ""
        
        ocr = get_easyocr()
        if not ocr: return ""
        
        results = ocr.readtext(processed, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
        if not results: return ""
        
        for (bbox, text, prob) in results:
            clean = clean_ocr_result(text)
            if len(clean) == 6:
                print(f"[CAPTCHA] EasyOCR Success: '{clean}' (confidence {prob:.2f})", file=sys.stderr)
                return clean
                
        combined = "".join([clean_ocr_result(t) for b, t, p in results])
        if len(combined) >= 6:
            final_guess = combined[:6]
            print(f"[CAPTCHA] EasyOCR Combined: '{final_guess}'", file=sys.stderr)
            return final_guess

    except Exception as e:
        print(f"[CAPTCHA] Solver error: {e}", file=sys.stderr)
    finally:
        gc.collect()

    return ""

