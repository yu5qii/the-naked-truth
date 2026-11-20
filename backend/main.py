import os
import time
from typing import Dict, List
from collections import defaultdict
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from backend.api.routes.analysis import router as analysis_router

app = FastAPI(
    title="The Naked Truth - Anti-Echo Chamber News Engine",
    description="Cross-examines polarizing news coverage and isolates consensus facts without media spin.",
    version="1.0.0"
)

# -----------------------------------------------------------------------------
# Rate Limiting Engine (Redis with In-Memory Sliding Window Fallback)
# -----------------------------------------------------------------------------
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "60"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))

class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.history: Dict[str, List[float]] = defaultdict(list)
        self.redis_client = None

        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis
                self.redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
                self.redis_client.ping()
            except Exception:
                self.redis_client = None

    def is_rate_limited(self, client_id: str) -> tuple[bool, int, int]:
        current_time = time.time()

        if self.redis_client:
            try:
                key = f"rl:{client_id}"
                pipeline = self.redis_client.pipeline()
                pipeline.zremrangebyscore(key, 0, current_time - self.window_seconds)
                pipeline.zadd(key, {str(current_time): current_time})
                pipeline.zcard(key)
                pipeline.expire(key, self.window_seconds)
                results = pipeline.execute()
                count = results[2]
                remaining = max(0, self.max_requests - count)
                if count > self.max_requests:
                    return True, 0, self.window_seconds
                return False, remaining, 0
            except Exception:
                pass

        window_start = current_time - self.window_seconds
        req_times = self.history[client_id]
        self.history[client_id] = [t for t in req_times if t > window_start]
        self.history[client_id].append(current_time)

        count = len(self.history[client_id])
        remaining = max(0, self.max_requests - count)
        if count > self.max_requests:
            retry_after = int(self.window_seconds - (current_time - self.history[client_id][0]))
            return True, 0, max(1, retry_after)

        return False, remaining, 0

    def reset_for_test(self, client_id: str = None):
        if client_id:
            self.history.pop(client_id, None)
        else:
            self.history.clear()

rate_limiter = RateLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS)

# -----------------------------------------------------------------------------
# Strict CORS Configuration
# -----------------------------------------------------------------------------
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
)

@app.middleware("http")
async def security_and_rate_limit_middleware(request: Request, call_next):
    # Pass OPTIONS preflight through directly
    if request.method == "OPTIONS":
        return await call_next(request)

    client_ip = request.client.host if request.client else "127.0.0.1"
    client_id = request.headers.get("X-Forwarded-For", client_ip).split(",")[0].strip()

    if request.url.path not in ("/health", "/docs", "/openapi.json"):
        is_limited, remaining, retry_after = rate_limiter.is_rate_limited(client_id)
        if is_limited:
            return Response(
                content='{"detail": "Too Many Requests. Rate limit exceeded."}',
                status_code=429,
                media_type="application/json",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(rate_limiter.max_requests),
                    "X-RateLimit-Remaining": "0",
                }
            )

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

app.include_router(analysis_router, prefix="/api")

@app.get("/health")
def health_check():
    return {"status": "online", "service": "The Naked Truth Backend"}
