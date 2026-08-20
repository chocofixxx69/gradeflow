import cv2
import numpy as np
import re
import sys

# Initialize EasyOCR globally to speed up repeated calls
reader = None

def get_easyocr():
    global reader
    if reader is None:
        try:
            import easyocr
            # Load English model. It works better without GPU locally if dependencies aren't aligned.
            print("[CAPTCHA] Initializing EasyOCR Engine...", file=sys.stderr)
            reader = easyocr.Reader(['en'], gpu=False, verbose=False)
        except Exception as e:
            print(f"[CAPTCHA] Failed to load EasyOCR: {e}", file=sys.stderr)
    return reader

def preprocess_image(image_bytes: bytes):
    """Clean the image for EasyOCR"""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None: return None
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    upscaled = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)
    
    # EasyOCR loves clear contrast. Let's just threshold.
    _, thresh = cv2.threshold(upscaled, 140, 255, cv2.THRESH_BINARY)
    return thresh

def clean_ocr_result(text: str) -> str:
    """Standard Alphanumeric sanitize."""
    if not text: return ""
    clean = re.sub(r'[^A-Za-z0-9]', '', text)
    if len(clean) > 6: clean = clean[:6]
    return clean

def solve_captcha(image_bytes: bytes) -> str:
    """Solve VTU captcha using EasyOCR"""
    try:
        processed = preprocess_image(image_bytes)
        if processed is None: return ""
        
        ocr = get_easyocr()
        # Read text
        results = ocr.readtext(processed, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
        if not results: return ""
        
        for (bbox, text, prob) in results:
            clean = clean_ocr_result(text)
            if len(clean) == 6:
                print(f"[CAPTCHA] EasyOCR Success: '{clean}' (confidence {prob:.2f})", file=sys.stderr)
                return clean
                
        # If it found segments but none were exactly 6 chars, try combining them
        combined = "".join([clean_ocr_result(t) for b, t, p in results])
        if len(combined) >= 6:
            final_guess = combined[:6]
            print(f"[CAPTCHA] EasyOCR Combined: '{final_guess}'", file=sys.stderr)
            return final_guess

    except Exception as e:
        print(f"[CAPTCHA] Solver fatal: {e}", file=sys.stderr)
    return ""
