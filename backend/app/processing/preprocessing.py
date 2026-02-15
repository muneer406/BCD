from typing import Any, Dict


def _wrap_image(image: Any) -> Dict[str, Any]:
    if isinstance(image, dict) and "ops" in image:
        return image
    return {"source": image, "ops": []}


def normalize_image(image: Any) -> Dict[str, Any]:
    wrapped = _wrap_image(image)
    return {**wrapped, "ops": [*wrapped["ops"], "normalize"]}


def crop_region_of_interest(image: Any) -> Dict[str, Any]:
    wrapped = _wrap_image(image)
    return {**wrapped, "ops": [*wrapped["ops"], "crop_roi"]}


def resize(image: Any, size: tuple[int, int]) -> Dict[str, Any]:
    wrapped = _wrap_image(image)
    return {
        **wrapped,
        "ops": [*wrapped["ops"], f"resize_{size[0]}x{size[1]}"]
    }
