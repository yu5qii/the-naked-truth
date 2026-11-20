import pytest
from backend.main import app, rate_limiter, ALLOWED_ORIGINS, RateLimiter

@pytest.fixture(autouse=True)
def reset_limiter():
    rate_limiter.reset_for_test()
    yield
    rate_limiter.reset_for_test()

class TestRateLimitAndCORS:
    def test_rate_limiting_sliding_window_enforces_limit(self):
        """Verifies that exceeding the configured request threshold triggers rate limiting."""
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        client_id = "203.0.113.195"

        # First 5 requests should pass
        for i in range(5):
            is_limited, remaining, retry_after = limiter.is_rate_limited(client_id)
            assert is_limited is False
            assert remaining == 5 - (i + 1)
            assert retry_after == 0

        # 6th request must trigger rate limit (HTTP 429 condition)
        is_limited, remaining, retry_after = limiter.is_rate_limited(client_id)
        assert is_limited is True
        assert remaining == 0
        assert retry_after > 0

    def test_rate_limiting_isolated_per_client(self):
        """Verifies that rate limit buckets are strictly isolated per client IP."""
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        client_a = "198.51.100.1"
        client_b = "198.51.100.2"

        # Exhaust limit for client A
        limiter.is_rate_limited(client_a)
        limiter.is_rate_limited(client_a)
        assert limiter.is_rate_limited(client_a)[0] is True

        # Client B must still have full quota
        is_limited, remaining, _ = limiter.is_rate_limited(client_b)
        assert is_limited is False
        assert remaining == 1

    def test_strict_cors_origins_whitelist(self):
        """Verifies legitimate frontend origins are whitelisted in CORS configuration."""
        assert "http://localhost:3000" in ALLOWED_ORIGINS
        assert "http://127.0.0.1:3000" in ALLOWED_ORIGINS

    def test_strict_cors_rejects_unauthorized_origins(self):
        """Verifies unauthorized third-party origins are strictly excluded from CORS allowed origins."""
        unauthorized_origins = [
            "http://unauthorized-attacker.com",
            "http://evil-phishing.org",
            "null",
            "*"
        ]
        for origin in unauthorized_origins:
            assert origin not in ALLOWED_ORIGINS
