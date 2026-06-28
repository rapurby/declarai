import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

def preprocess_image(file_bytes: bytes) -> np.ndarray:
    """
    Stage 1: Pre-process document image for optimal OCR accuracy.
    - Deskew (correct tilt/rotation)
    - Grayscale conversion
    - CLAHE contrast enhancement
    - Denoising
    """
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image file")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    denoised = cv2.fastNlMeansDenoising(enhanced, h=10)
    deskewed = _deskew(denoised)
    logger.info("✅ Preprocessing complete")
    return deskewed

def _deskew(img: np.ndarray) -> np.ndarray:
    coords = np.column_stack(np.where(img > 0))
    if len(coords) < 10:
        return img
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    if abs(angle) < 0.5:
        return img
    (h, w) = img.shape
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(img, M, (w, h),
                          flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)
