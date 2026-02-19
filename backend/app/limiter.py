"""
BCD Backend - limiter.py
Phase 5: Shared rate limiter instance.

Centralised so that API route modules can import the limiter directly
without creating circular imports through main.py.
"""

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address)
except ImportError:
    # slowapi not installed — provide a no-op decorator so route modules
    # can still import and use @limiter.limit(...) without crashing.
    class _NoOpLimiter:  # type: ignore[no-redef]
        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

    limiter = _NoOpLimiter()  # type: ignore[assignment]
