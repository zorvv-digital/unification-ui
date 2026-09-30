"""
Decision model: narrow, fast classification of customer text (which products a customer is interested in).

`DECISION_PROVIDER=fake` (default, tests) matches product names and keywords offline; `laya` runs the open-source
Laya model locally (`uv sync --extra laya`), asking one yes/no question per product.
"""

import asyncio
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from app.config.settings import settings

FAKE_YES, FAKE_NO = 0.9, 0.05


class DecisionError(Exception):
    """The decision model is not installed, failed to load, or failed to answer."""


@dataclass
class ProductOption:
    id: str
    name: str
    description: Optional[str] = None
    keywords: list[str] = field(default_factory=list)


async def product_interest(text: str, products: list[ProductOption]) -> dict[str, float]:
    """
    Decides, for each product, how likely the customer text shows interest in it.

    Args:
        text (str): The customer's messages.
        products (list[ProductOption]): Workspace products.

    Returns:
        dict[str, float]: Product id to probability (0-1).

    Raises:
        DecisionError: When the configured model cannot answer.
    """
    if not products or not text.strip():
        return {p.id: 0.0 for p in products}
    if settings.DECISION_PROVIDER == "laya":
        return await asyncio.to_thread(_laya_interest, text, products)
    return {p.id: (FAKE_YES if _mentions(text, p) else FAKE_NO) for p in products}


# ==========================================
# Fake provider: whole-word match of the name or a keyword (singular or plural)
# ==========================================

def _mentions(text: str, product: ProductOption) -> bool:
    words = set(re.findall(r"[a-z0-9]+", text.lower()))
    words |= {w[:-1] for w in words if w.endswith("s")}
    for term in [product.name, *product.keywords]:
        parts = re.findall(r"[a-z0-9]+", term.lower())
        if parts and all(p in words or p.rstrip("s") in words for p in parts):
            return True
    return False


# ==========================================
# Laya provider
# ==========================================

_router: Any = None


def _laya_router():
    global _router
    if _router is None:
        try:
            from laya import Router  # optional extra: torch + transformers, model downloaded on first use
        except ImportError as exc:
            raise DecisionError("Laya is not installed (run `uv sync --extra laya`)") from exc
        _router = Router(max_loaded=1)  # ponytail: one model in memory; raise when serving several languages at once
    return _router


def _question(product: ProductOption) -> dict:
    # Phrasing tuned on real chats: naming the product with its description and examples in brackets separated
    # interested from unrelated customers best (e.g. balayage -> Hair colouring 0.61, parking question <= 0.16).
    hints = "; ".join(filter(None, [product.description, f"e.g. {', '.join(product.keywords)}" if product.keywords else ""]))
    return {"type": "noul", "instructions": f"Is the customer asking about {product.name}{f' ({hints})' if hints else ''}?"}


def _laya_interest(text: str, products: list[ProductOption]) -> dict[str, float]:
    try:
        result = _laya_router().predict(text, {p.id: _question(p) for p in products})
        return {p.id: float(result["answers"][p.id]["noul"]) for p in products}
    except DecisionError:
        raise
    except Exception as exc:  # model download, load, or inference failure
        raise DecisionError(f"Laya failed: {exc}") from exc
