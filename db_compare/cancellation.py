"""Thread-safe, best-effort cancellation for active database operations."""

from __future__ import annotations

from threading import Lock, Thread
from typing import Callable


class CancellationController:
    """Track driver cancellation callbacks without exposing connections globally."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._callbacks: set[Callable[[], None]] = set()
        self._cancelled = False

    @property
    def cancelled(self) -> bool:
        with self._lock:
            return self._cancelled

    def register(self, callback: Callable[[], None]) -> None:
        with self._lock:
            if not self._cancelled:
                self._callbacks.add(callback)
                return
        self._invoke(callback)

    def unregister(self, callback: Callable[[], None]) -> None:
        with self._lock:
            self._callbacks.discard(callback)

    def cancel_now(self) -> int:
        with self._lock:
            self._cancelled = True
            callbacks = list(self._callbacks)
        for callback in callbacks:
            Thread(
                target=self._invoke,
                args=(callback,),
                daemon=True,
                name="database-cancel",
            ).start()
        return len(callbacks)

    @staticmethod
    def _invoke(callback: Callable[[], None]) -> None:
        try:
            callback()
        except Exception:
            # Cancellation is best-effort. The comparison worker reports the
            # eventual driver outcome without leaking low-level error details.
            pass
