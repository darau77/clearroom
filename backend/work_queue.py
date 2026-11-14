"""One inference worker, bounded FIFO admission, and cancellation-safe release."""
import asyncio
from contextlib import asynccontextmanager

class QueueFull(Exception):pass
class QueueTimeout(Exception):pass
class WorkQueue:
    def __init__(self,capacity=4,timeout=45):
        self.capacity=capacity
        self.timeout=timeout
        self.depth=0
        self.lock=asyncio.Lock()
    @asynccontextmanager
    async def slot(self):
        if self.depth>=self.capacity:raise QueueFull()
        self.depth+=1
        acquired=False
        try:
            try:
                await asyncio.wait_for(self.lock.acquire(),self.timeout)
                acquired=True
            except TimeoutError:raise QueueTimeout() from None
            yield
        finally:
            if acquired:self.lock.release()
            self.depth-=1
