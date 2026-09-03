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

def build_variants(image_bytes: bytes):
    """Produce several INDEPENDENT preprocessings of the same captcha.

    A wrong guess costs a full network round-trip to VTU (submit + response +
    reload, seconds); one extra GPU inference on a ~150x50 image costs tens of
    milliseconds. So it is overwhelmingly worth spending a few extra inferences
    to avoid even one wasted submission — that is the whole point of this list.

    The variants deliberately fail in *different* ways: a fixed threshold dies
    on unusually dark/bright captchas, Otsu adapts per-image, opening kills
    speckle noise, and raw greyscale keeps strokes a threshold might sever.
    When two disagreeing methods land on the same string, that agreement is a
    far better correctness signal than EasyOCR's own confidence score, which
    on VTU captchas is close to worthless (observed: 0.99 wrong, 0.09 right).
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None: return []

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    up = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_LANCZOS4)

    variants = []
    # 1. Otsu — picks the threshold per image instead of assuming 140 fits all.
    _, otsu = cv2.threshold(up, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(otsu)
    # 2. Otsu + morphological opening — removes the speckle/dot noise VTU
    #    sprinkles over the glyphs.
    variants.append(cv2.morphologyEx(otsu, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)))
    # 3. The original fixed threshold — kept because it demonstrably does solve
    #    a good share of them; it is just not right for every image.
    _, fixed = cv2.threshold(up, 140, 255, cv2.THRESH_BINARY)
    variants.append(fixed)
    # 4. No thresholding at all — some captchas lose thin strokes to any
    #    binarisation, and the recognizer handles greyscale fine.
    variants.append(up)
    return variants

def clean_ocr_result(text: str) -> str:
    """Standard Alphanumeric sanitize."""
    if not text: return ""
    clean = re.sub(r'[^A-Za-z0-9]', '', text)
    if len(clean) > 6: clean = clean[:6]
    return clean

ALLOWLIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

def _read_variant(ocr, image) -> tuple:
    """Run one preprocessed image through the recognizer. Returns (text, conf)."""
    # recognize() skips CRAFT text-detection and runs character recognition directly
    results = ocr.recognize(image, allowlist=ALLOWLIST)
    if not results:
        return ("", 0.0)

    for (_bbox, text, prob) in results:
        clean = clean_ocr_result(text)
        if len(clean) == 6:
            return (clean, float(prob))

    # If segments found but none exactly 6 chars, combine them
    combined = "".join([clean_ocr_result(t) for _b, t, _p in results])
    if len(combined) >= 6:
        avg = sum(float(p) for _b, _t, p in results) / max(1, len(results))
        return (combined[:6], avg)
    return ("", 0.0)

def solve_captcha(image_bytes: bytes) -> str:
    """Solve VTU captcha with hybrid CPU preprocessing + GPU neural inference.

    Reads the same captcha through several independent preprocessings and
    returns the string two of them agree on. Inference is cheap next to a
    wasted submission to VTU, so this trades a few extra milliseconds of GPU
    time for materially fewer failed round-trips. See build_variants().
    """
    try:
        # 1. CPU-bound image preprocessing (outside the lock — no GPU involved,
        #    so parallel browser workers can prepare their images concurrently).
        variants = build_variants(image_bytes)
        if not variants: return ""

        ocr = get_easyocr()
        if ocr is None: return ""

        import torch

        # 2. Thread-safe GPU neural network recognition, one variant at a time,
        #    stopping the moment two variants corroborate each other.
        votes = {}
        best_text, best_conf = "", -1.0
        with _solver_lock:
            with torch.inference_mode():
                for image in variants:
                    text, conf = _read_variant(ocr, image)
                    if not text:
                        continue
                    votes[text] = votes.get(text, 0) + 1
                    if conf > best_conf:
                        best_text, best_conf = text, conf
                    if votes[text] >= 2:
                        print(f"[CAPTCHA] Consensus: '{text}' ({votes[text]}/{len(variants)} variants agree)", file=sys.stderr)
                        return text

        if best_text:
            # No two variants agreed — fall back to the most confident reading.
            print(f"[CAPTCHA] Best guess: '{best_text}' (confidence {best_conf:.2f}, no consensus)", file=sys.stderr)
            return best_text

    except Exception as e:
        print(f"[CAPTCHA] Solver fatal: {e}", file=sys.stderr)
    return ""
