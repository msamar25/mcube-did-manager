"""Single-process nonblocking operation gate.

Only safe with exactly one server instance and one worker. It is NOT a
cross-process/distributed lock. Never scale horizontally with this module.
"""
import asyncio
import threading
from fastapi import HTTPException

class Lease:
    def __init__(self, gate):
        self.gate = gate
        self.closed = False
    def release(self):
        if not self.closed:
            self.closed = True
            self.gate._local.release()

class OperationLock:
    def __init__(self):
        self._local = threading.Lock()
    def locked(self):
        return self._local.locked()
    def _acquire(self):
        if not self._local.acquire(blocking=False):
            raise HTTPException(409, 'Another operation is in progress; refresh and retry')
        return Lease(self)
    async def acquire(self):
        return await asyncio.to_thread(self._acquire)
    async def release(self, lease):
        await asyncio.to_thread(lease.release)
    async def __aenter__(self):
        self._lease = await self.acquire()
        return self
    async def __aexit__(self, *_):
        lease = self._lease
        self._lease = None
        await self.release(lease)
