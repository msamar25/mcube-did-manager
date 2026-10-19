import asyncio
import unittest
from fastapi import HTTPException
from backend.operation_lock import OperationLock

class LockTests(unittest.IsolatedAsyncioTestCase):
    async def test_second_operator_rejected_then_released(self):
        gate=OperationLock()
        lease=await gate.acquire()
        self.assertTrue(gate.locked())
        with self.assertRaises(HTTPException) as ctx:
            await gate.acquire()
        self.assertEqual(ctx.exception.status_code,409)
        await gate.release(lease)
        self.assertFalse(gate.locked())
        lease2=await gate.acquire()
        await gate.release(lease2)

    async def test_exception_releases_lock(self):
        gate=OperationLock()
        with self.assertRaises(ValueError):
            async with gate:
                raise ValueError('simulated failure')
        self.assertFalse(gate.locked())

if __name__=='__main__': unittest.main()
