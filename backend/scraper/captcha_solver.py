import os
import cv2
import numpy as np
import re
import sys
import threading

# Initialize EasyOCR globally to speed up repeated calls
reader = None
_solver_lock = threading.Lock()
_has_gpu = False

def get_easyocr():
    global reader, _has_gpu
    if reader is None:
        with _solver_lock:
            if reader is None:
                try:
                    import easyocr
                    import torch
                    force_cpu = os.getenv("FORCE_CPU", "false").lower() in ("true", "1", "yes")
                    _has_gpu = False if force_cpu else bool(torch.cuda.is_available())
                    
                    if _has_gpu:
                        device_name = torch.cuda.get_device_name(0)
                        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
                        print(f"[CAPTCHA] Engine: CUDA GPU ({device_name}, {vram_gb:.1f} GB VRAM)", file=sys.stderr)
                        # Enable cuDNN benchmark for constant input sizes
                        torch.backends.cudnn.benchmark = True
                    else:
                        cores = os.cpu_count() or 1
                        torch.set_num_threads(max(1, cores))
                        mode_str = "Forced CPU" if force_cpu else f"CPU Multi-Core ({cores} cores)"
                        print(f"[CAPTCHA] Engine: {mode_str}", file=sys.stderr)

                    reader = easyocr.Reader(['en'], gpu=_has_gpu, verbose=False)

                    # Warmup run: compiles CUDA kernels and eliminates cold-start latency
                    try:
                        dummy = np.zeros((60, 160), dtype=np.uint8)
                        with torch.inference_mode():
                            reader.recognize(dummy, allowlist='0123456789')
                    except Exception:
                        pass

                except Exception as e:
                    print(f"[CAPTCHA] Failed to load EasyOCR: {e}", file=sys.stderr)
    return reader

def preprocess_image(image_bytes: bytes):
    """Clean the image for EasyOCR using multi-core CPU SIMD operations."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None: return None
    
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    upscaled = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)
    
    # EasyOCR loves clear contrast. Otsu/Binary threshold
    _, thresh = cv2.threshold(upscaled, 140, 255, cv2.THRESH_BINARY)
    return thresh

def clean_ocr_result(text: str) -> str:
    """Standard Alphanumeric sanitize."""
    if not text: return ""
    clean = re.sub(r'[^A-Za-z0-9]', '', text)
    if len(clean) > 6: clean = clean[:6]
    return clean

def solve_captcha(image_bytes: bytes) -> str:
    """Solve VTU captcha with hybrid CPU preprocessing + GPU neural inference."""
    try:
        # 1. CPU-bound image preprocessing
        processed = preprocess_image(image_bytes)
        if processed is None: return ""
        
        ocr = get_easyocr()
        if ocr is None: return ""

        import torch

        # 2. Thread-safe GPU neural network recognition
        with _solver_lock:
            with torch.inference_mode():
                # recognize() skips CRAFT text-detection and runs character recognition directly
                results = ocr.recognize(processed, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
        
        if not results: return ""
        
        for (bbox, text, prob) in results:
            clean = clean_ocr_result(text)
            if len(clean) == 6:
                print(f"[CAPTCHA] EasyOCR Success: '{clean}' (confidence {prob:.2f})", file=sys.stderr)
                return clean
                
        # If segments found but none exactly 6 chars, combine them
        combined = "".join([clean_ocr_result(t) for b, t, p in results])
        if len(combined) >= 6:
            final_guess = combined[:6]
            print(f"[CAPTCHA] EasyOCR Combined: '{final_guess}'", file=sys.stderr)
            return final_guess

    except Exception as e:
        print(f"[CAPTCHA] Solver fatal: {e}", file=sys.stderr)
    return ""
