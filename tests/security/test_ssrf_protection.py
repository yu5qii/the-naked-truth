import os
import json
import socket
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from backend.services.scraper import ScraperService, SSRFSecurityError
from backend.api.routes.analysis import distill_truth
from backend.models.schemas import AnalysisRequest

FIXTURES_PATH = os.path.join(os.path.dirname(__file__), "..", "fixtures", "malicious_payloads.json")

with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
    PAYLOADS = json.load(f)["ssrf_payloads"]

class TestSSRFProtection:
    """Verifies that ScraperService and the API reject internal, private, and metadata targets."""

    @pytest.mark.parametrize("payload", PAYLOADS, ids=[p["name"] for p in PAYLOADS])
    def test_scraper_unit_ssrf_validation(self, payload):
        target_url = payload["url"]
        with pytest.raises(SSRFSecurityError) as exc_info:
            ScraperService.validate_url_safety(target_url)
        err = str(exc_info.value).lower()
        assert "blocked" in err or "prohibited" in err or "failed" in err or "strictly" in err

    @pytest.mark.parametrize("payload", PAYLOADS[:8], ids=[p["name"] for p in PAYLOADS[:8]])
    def test_api_endpoint_ssrf_rejection(self, payload):
        """Tests that the distill endpoint rejects SSRF targets with HTTP 400."""
        req = AnalysisRequest(url=payload["url"])
        coro = distill_truth(req)
        with pytest.raises(HTTPException) as exc_info:
            coro.send(None)

        assert exc_info.value.status_code == 400
        detail = str(exc_info.value.detail)
        assert "SSRF Protection" in detail or "blocked" in detail.lower()

    @patch("socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("151.101.0.111", 0))])
    def test_public_allowed_url(self, mock_dns):
        """Verifies legitimate public URLs pass validation."""
        valid, msg = ScraperService.validate_url_safety("https://www.theguardian.com/world/news")
        assert valid is True
