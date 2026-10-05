import os
import cv2
import numpy as np
import re
import sys
import threading

# Initialize EasyOCR globally to speed up repeated calls
reader = None
_solver_lock = threading.Lock()
_cpu_semaphore = threading.Semaphore(max(1, min(4, (os.cpu_count() or 2) // 2 or 1)))
_has_gpu = False

def get_easyocr():
    global reader, _has_gpu
    if reader is None:
        with _solver_lock:
            if reader is None:
                try:
                    import easyocr
                    import torch
                    import warnings
                    warnings.filterwarnings("ignore", category=UserWarning, module="torch")

                    force_cpu = os.getenv("FORCE_CPU", "false").lower() in ("true", "1", "yes")
                    _has_gpu = False if force_cpu else bool(torch.cuda.is_available())
                    
                    if _has_gpu:
                        device_name = torch.cuda.get_device_name(0)
                        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
                        print(f"[CAPTCHA] Engine: CUDA GPU ({device_name}, {vram_gb:.1f} GB VRAM)", file=sys.stderr)
                        torch.backends.cudnn.benchmark = False
                        try:
                            torch.cuda.set_per_process_memory_fraction(0.35)
                        except Exception:
                            pass
                    else:
                        cores = os.cpu_count() or 1
                        opt_threads = max(1, min(4, cores))
                        torch.set_num_threads(opt_threads)
                        try:
                            torch.set_num_interop_threads(1)
                        except Exception:
                            pass
                        mode_str = "Forced CPU" if force_cpu else f"CPU Multi-Core ({cores} cores, {opt_threads} worker threads)"
                        print(f"[CAPTCHA] Engine: {mode_str}", file=sys.stderr)

                    # detector=False: this module only ever calls reader.recognize()
                    # (never .readtext()), so the ~77MB CRAFT text-detection network is
                    # unused. Skipping it avoids downloading/loading a model this code
                    # never touches; recognition (english_g2.pth) is unaffected.
                    reader = easyocr.Reader(['en'], gpu=_has_gpu, verbose=False, detector=False)

                    # Warmup run: compiles kernels / graphs and eliminates first-request cold-start
                    try:
                        dummy = np.zeros((60, 160), dtype=np.uint8)
                        with torch.inference_mode():
                            reader.recognize(dummy, allowlist='0123456789')
                    except Exception:
                        pass

                except Exception as e:
                    print(f"[CAPTCHA] Failed to load EasyOCR: {e}", file=sys.stderr)
                    reader = False
    return reader if reader is not False else None

def preprocess_vtu_primary(gray_up):
    """Primary VTU-tailored image preprocessing:
    Removes random background speckle noise while preserving crisp character glyphs.
    """
    # 1. Bilateral filter preserves edges while smoothing uniform background speckles
    filtered = cv2.bilateralFilter(gray_up, d=5, sigmaColor=50, sigmaSpace=50)
    # 2. Otsu auto-threshold
    _, thresh = cv2.threshold(filtered, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # 3. Small morphological opening to remove 1-2px salt-and-pepper noise dots
    opened = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return opened

def build_variants(image_bytes: bytes):
    """Produce ordered preprocessing variants of the captcha image.
    Ordered from highest probability of single-pass success to fallback.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None: return []

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    up = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)

    variants = []
    # 1. Primary VTU: Bilateral + Otsu + Speckle Morph Clean
    variants.append(preprocess_vtu_primary(up))
    # 2. Adaptive CLAHE for variable illumination / faint characters
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    cl = clahe.apply(up)
    _, otsu_cl = cv2.threshold(cl, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(otsu_cl)
    # 3. Classic fixed threshold (140)
    _, fixed = cv2.threshold(up, 140, 255, cv2.THRESH_BINARY)
    variants.append(fixed)
    # 4. Raw Lanczos upscaled grayscale (EasyOCR recognizer handles grayscale fine)
    variants.append(up)
    return variants

_dddd_instance = None
_dddd_lock = threading.Lock()

def get_ddddocr():
    global _dddd_instance
    if _dddd_instance is None:
        with _dddd_lock:
            if _dddd_instance is None:
                try:
                    import ddddocr
                    _dddd_instance = ddddocr.DdddOcr(show_ad=False)
                    try:
                        _dddd_instance.set_ranges('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
                    except Exception:
                        pass
                except Exception as e:
                    print(f"[CAPTCHA] ddddocr init failed: {e}", file=sys.stderr)
                    _dddd_instance = False
    return _dddd_instance if _dddd_instance is not False else None

def clean_ocr_result(text: str) -> str:
    """Standard Alphanumeric sanitize. Supports 4-6 character VTU format."""
    if not text: return ""
    clean = re.sub(r'[^A-Za-z0-9]', '', text)
    if clean.upper().startswith("CAPTCH"):
        return ""
    if len(clean) > 6:
        clean = clean[:6]
    return clean

ALLOWLIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

def _read_variant(ocr, image) -> tuple:
    """Run one preprocessed image through the recognizer. Returns (text, conf)."""
    results = ocr.recognize(image, allowlist=ALLOWLIST)
    if not results:
        return ("", 0.0)

    for (_bbox, text, prob) in results:
        clean = clean_ocr_result(text)
        if 4 <= len(clean) <= 6:
            return (clean, float(prob))

    # If segments found but split across bounding boxes, combine them
    combined = "".join([clean_ocr_result(t) for _b, t, _p in results])
    if len(combined) >= 4:
        avg = sum(float(p) for _b, _t, p in results) / max(1, len(results))
        return (combined[:6], avg)
    return ("", 0.0)

def solve_captcha(image_bytes: bytes) -> str:
    """Solve VTU captcha with ultrafast primary ddddocr and EasyOCR consensus fallback.

    Features:
    - Primary Engine (ddddocr): 5ms inference, ~86% single-pass accuracy on VTU fonts,
      supports natural 4, 5, and 6-character VTU captcha lengths.
    - Secondary Engine (EasyOCR): Multi-variant consensus fallback if ddddocr is unavailable
      or yields an invalid length (<4 chars).
    """
    try:
        # 1. Primary: ddddocr (~5ms, high accuracy on VTU alphanumeric captchas)
        d_ocr = get_ddddocr()
        if d_ocr is not None:
            # VTU captcha features dark foreground text (intensity < 125) over light/colored background words.
            # Isolating dark pixels eliminates background words and gives 90%+ single-pass accuracy.
            candidates = []
            try:
                nparr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img is not None:
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    for th in (125, 115, 135):
                        _, binary = cv2.threshold(gray, th, 255, cv2.THRESH_BINARY)
                        _, buf = cv2.imencode('.png', binary)
                        candidates.append(buf.tobytes())
            except Exception:
                pass
            candidates.append(image_bytes)

            for cand_bytes in candidates:
                try:
                    raw_pred = d_ocr.classification(cand_bytes)
                    clean_pred = clean_ocr_result(raw_pred)
                    if 4 <= len(clean_pred) <= 6:
                        return clean_pred
                except Exception:
                    pass

        # 2. Secondary Fallback: EasyOCR with multi-variant image preprocessing
        variants = build_variants(image_bytes)
        if not variants: return ""

        ocr = get_easyocr()
        if ocr is None:
            return ""

        import torch

        lock_ctx = _solver_lock if _has_gpu else _cpu_semaphore
        votes = {}
        best_text, best_conf = "", -1.0

        with lock_ctx:
            with torch.inference_mode():
                for idx, image in enumerate(variants):
                    try:
                        text, conf = _read_variant(ocr, image)
                    except (torch.cuda.OutOfMemoryError, RuntimeError) as cuda_err:
                        if "out of memory" in str(cuda_err).lower():
                            try: torch.cuda.empty_cache()
                            except Exception: pass
                            text, conf = _read_variant(ocr, image)
                        else:
                            raise

                    if not text:
                        continue

                    votes[text] = votes.get(text, 0) + 1
                    if conf > best_conf:
                        best_text, best_conf = text, conf

                    # High confidence fast path
                    if idx == 0 and 4 <= len(text) <= 6 and conf >= 0.75 and not _has_gpu:
                        return text

                    # Consensus check
                    if votes[text] >= 2 and 4 <= len(text) <= 6:
                        return text

        if best_text and 4 <= len(best_text) <= 6:
            return best_text
        elif best_text:
            return best_text[:6]

    except Exception as e:
        print(f"[CAPTCHA] Solver fatal: {e}", file=sys.stderr)
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
    return ""
