import time
from collections import OrderedDict, deque
from collections.abc import Callable

WINDOW_SECONDS = 60
MAX_BUCKETS = 50_000
MAX_KNOWN_LIMITS = 10_000


class SlidingWindowLimiter:
    """In-memory sliding window with a hard cap on how many identities it tracks."""

    def __init__(
        self,
        window_seconds: float = WINDOW_SECONDS,
        max_buckets: int = MAX_BUCKETS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.window_seconds = window_seconds
        self.max_buckets = max_buckets
        self._clock = clock
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()
        self._known_limits: OrderedDict[str, int] = OrderedDict()

    def __len__(self) -> int:
        return len(self._hits)

    def remember_limit(self, identity: str, limit: int) -> None:
        self._known_limits[identity] = limit
        self._known_limits.move_to_end(identity)
        while len(self._known_limits) > MAX_KNOWN_LIMITS:
            self._known_limits.popitem(last=False)

    def known_limit(self, identity: str) -> int | None:
        return self._known_limits.get(identity)

    def _prune(self, now: float) -> None:
        expired = [
            identity
            for identity, window in self._hits.items()
            if not window or now - window[-1] > self.window_seconds
        ]
        for identity in expired:
            del self._hits[identity]
        # Still full of live buckets: drop the least recently used ones.
        while len(self._hits) >= self.max_buckets:
            self._hits.popitem(last=False)

    def hit(self, identity: str, limit: int) -> int | None:
        """Record a request. Returns seconds to wait when the limit is exceeded."""
        now = self._clock()
        window = self._hits.get(identity)
        if window is None:
            if len(self._hits) >= self.max_buckets:
                self._prune(now)
            window = self._hits[identity] = deque()
        else:
            self._hits.move_to_end(identity)

        while window and now - window[0] > self.window_seconds:
            window.popleft()

        if len(window) >= limit:
            return int(self.window_seconds - (now - window[0])) + 1

        window.append(now)
        return None

    def reset(self) -> None:
        self._hits.clear()
        self._known_limits.clear()


limiter = SlidingWindowLimiter()


def key_identity(raw_key: str) -> str:
    from .api_keys import hash_key

    return f"key:{hash_key(raw_key)[:32]}"
