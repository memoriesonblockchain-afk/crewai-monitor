"""
Event buffer for batching and managing trace events.

This module provides a thread-safe buffer that:
- Accumulates events up to a batch size
- Triggers flush on timeout
- Handles backpressure when the backend is unavailable
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable, Generic, TypeVar

if TYPE_CHECKING:
    from .collector import TraceEvent

T = TypeVar("T")


@dataclass
class BufferConfig:
    """Configuration for the event buffer."""

    max_size: int = 1000  # Maximum events to hold
    batch_size: int = 100  # Events per batch
    flush_interval_seconds: float = 5.0  # Max time between flushes
    max_retry_queue_size: int = 5000  # Max events to keep for retry


class EventBuffer(Generic[T]):
    """
    Thread-safe event buffer with automatic flushing.

    Features:
    - Batches events for efficient sending
    - Time-based flushing for low-volume scenarios
    - Backpressure handling when send fails
    - Overflow protection
    """

    def __init__(
        self,
        config: BufferConfig,
        flush_callback: Callable[[list[T]], bool],
        on_overflow: Callable[[int], None] | None = None,
    ) -> None:
        """
        Initialize the buffer.

        Args:
            config: Buffer configuration
            flush_callback: Called with batch of events, returns True if successful
            on_overflow: Called when events are dropped due to overflow
        """
        self.config = config
        self.flush_callback = flush_callback
        self.on_overflow = on_overflow

        self._lock = threading.RLock()
        self._buffer: deque[T] = deque(maxlen=config.max_size)
        self._retry_queue: deque[T] = deque(maxlen=config.max_retry_queue_size)

        # Flush thread
        self._stop_event = threading.Event()
        self._flush_thread: threading.Thread | None = None
        self._last_flush_time = time.time()

        # Stats
        self._events_sent = 0
        self._events_dropped = 0
        self._flush_count = 0
        self._failed_flushes = 0

    def start(self) -> None:
        """Start the background flush thread."""
        if self._flush_thread is not None:
            return

        self._stop_event.clear()
        self._flush_thread = threading.Thread(
            target=self._flush_loop,
            daemon=True,
            name="crewai-monitor-buffer",
        )
        self._flush_thread.start()

    def stop(self) -> None:
        """Stop the buffer and flush remaining events."""
        self._stop_event.set()

        if self._flush_thread:
            self._flush_thread.join(timeout=10)
            self._flush_thread = None

        # Final flush
        self._do_flush(final=True)

    def add(self, event: T) -> bool:
        """
        Add an event to the buffer.

        Returns True if the event was added, False if dropped due to overflow.
        """
        with self._lock:
            if len(self._buffer) >= self.config.max_size:
                self._events_dropped += 1
                if self.on_overflow:
                    self.on_overflow(1)
                return False

            self._buffer.append(event)

            # Check if we should flush immediately
            if len(self._buffer) >= self.config.batch_size:
                self._schedule_flush()

            return True

    def add_many(self, events: list[T]) -> int:
        """
        Add multiple events to the buffer.

        Returns the number of events successfully added.
        """
        added = 0
        with self._lock:
            for event in events:
                if len(self._buffer) >= self.config.max_size:
                    dropped = len(events) - added
                    self._events_dropped += dropped
                    if self.on_overflow:
                        self.on_overflow(dropped)
                    break

                self._buffer.append(event)
                added += 1

            if len(self._buffer) >= self.config.batch_size:
                self._schedule_flush()

        return added

    def flush(self) -> None:
        """Force an immediate flush."""
        self._do_flush()

    def _flush_loop(self) -> None:
        """Background thread that handles periodic flushing."""
        while not self._stop_event.is_set():
            # Wait for flush interval or stop signal
            self._stop_event.wait(timeout=self.config.flush_interval_seconds)

            if self._stop_event.is_set():
                break

            # Check if we need to flush
            with self._lock:
                should_flush = (
                    len(self._buffer) > 0
                    and time.time() - self._last_flush_time >= self.config.flush_interval_seconds
                )

            if should_flush:
                self._do_flush()

    def _schedule_flush(self) -> None:
        """Schedule an immediate flush (called from add when batch is full)."""
        # Run flush in separate thread to not block add()
        threading.Thread(
            target=self._do_flush,
            daemon=True,
        ).start()

    def _do_flush(self, final: bool = False) -> None:
        """Actually perform the flush."""
        with self._lock:
            if not self._buffer and not self._retry_queue:
                return

            # Get events to send (retry queue first, then buffer)
            events_to_send: list[T] = []

            # Add retry queue events first
            while self._retry_queue and len(events_to_send) < self.config.batch_size:
                events_to_send.append(self._retry_queue.popleft())

            # Add buffer events
            while self._buffer and len(events_to_send) < self.config.batch_size:
                events_to_send.append(self._buffer.popleft())

            self._last_flush_time = time.time()

        if not events_to_send:
            return

        # Try to send
        try:
            success = self.flush_callback(events_to_send)
            self._flush_count += 1

            if success:
                self._events_sent += len(events_to_send)
            else:
                self._failed_flushes += 1
                self._requeue_events(events_to_send)

        except Exception:
            self._failed_flushes += 1
            self._requeue_events(events_to_send)

        # If this is final flush, keep trying until empty
        if final:
            with self._lock:
                if self._buffer or self._retry_queue:
                    self._do_flush(final=True)

    def _requeue_events(self, events: list[T]) -> None:
        """Put events back in retry queue."""
        with self._lock:
            dropped = 0
            for event in events:
                if len(self._retry_queue) >= self.config.max_retry_queue_size:
                    dropped += 1
                else:
                    self._retry_queue.append(event)

            if dropped > 0:
                self._events_dropped += dropped
                if self.on_overflow:
                    self.on_overflow(dropped)

    @property
    def size(self) -> int:
        """Get current buffer size."""
        with self._lock:
            return len(self._buffer)

    @property
    def retry_queue_size(self) -> int:
        """Get retry queue size."""
        with self._lock:
            return len(self._retry_queue)

    @property
    def stats(self) -> dict[str, int]:
        """Get buffer statistics."""
        return {
            "events_sent": self._events_sent,
            "events_dropped": self._events_dropped,
            "flush_count": self._flush_count,
            "failed_flushes": self._failed_flushes,
            "buffer_size": self.size,
            "retry_queue_size": self.retry_queue_size,
        }
