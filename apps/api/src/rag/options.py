"""Pull the tap-to-answer choices out of a streamed reply.

The model may end a clarifying question with ``[[options: a | b]]`` (see prompt.py).
That line is for the widget, not the reader, so it is held back from the token stream
and handed over separately once the reply is complete.
"""

from .prompt import OPTIONS_CLOSE, OPTIONS_OPEN

MAX_OPTIONS = 4
MAX_OPTION_CHARS = 40


class OptionsFilter:
    def __init__(self) -> None:
        self._pending = ""
        self._captured: str | None = None

    def feed(self, text: str) -> str:
        """Return the part of ``text`` that is safe to show now."""
        if self._captured is not None:
            self._captured += text
            return ""
        buffer = self._pending + text
        start = buffer.find(OPTIONS_OPEN)
        if start >= 0:
            self._captured = buffer[start:]
            self._pending = ""
            return buffer[:start]
        # Hold back a tail that could be the beginning of the marker.
        keep = 0
        for size in range(min(len(OPTIONS_OPEN) - 1, len(buffer)), 0, -1):
            if OPTIONS_OPEN.startswith(buffer[-size:]):
                keep = size
                break
        self._pending = buffer[len(buffer) - keep :] if keep else ""
        return buffer[: len(buffer) - keep]

    def finish(self) -> tuple[str, list[str]]:
        """Return any text still held back and the parsed choices."""
        if self._captured is None:
            tail, self._pending = self._pending, ""
            return tail, []
        body = self._captured[len(OPTIONS_OPEN) :]
        end = body.find(OPTIONS_CLOSE)
        if end >= 0:
            body = body[:end]
        choices = [part.strip() for part in body.replace("｜", "|").split("|")]
        return "", [c[:MAX_OPTION_CHARS] for c in choices if c][:MAX_OPTIONS]
