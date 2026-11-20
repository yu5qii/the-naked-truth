import logging
import socket
import ipaddress
from urllib.parse import urlparse
from typing import Optional, Dict, Any, Tuple
import trafilatura
from bs4 import BeautifulSoup
import httpx

logger = logging.getLogger(__name__)

# Cloud metadata addresses and hostnames that must be blocked
BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "instance-data",
    "metadata",
}

BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # Link-local / Cloud metadata (169.254.169.254)
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),       # Multicast
    ipaddress.ip_network("240.0.0.0/4"),       # Reserved
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("::/128"),            # IPv6 unspecified
    ipaddress.ip_network("fc00::/7"),          # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
    ipaddress.ip_network("ff00::/8"),          # IPv6 multicast
]

class SSRFSecurityError(ValueError):
    """Raised when a URL targets restricted internal, loopback, or metadata addresses."""
    pass

class ScraperService:
    @staticmethod
    def validate_url_safety(url: str) -> Tuple[bool, str]:
        """
        Validates URL scheme, resolves IP, and verifies it is not a private,
        loopback, link-local, or cloud metadata target (SSRF prevention).
        """
        if not url or not isinstance(url, str):
            raise SSRFSecurityError("Invalid URL: must be a non-empty string.")

        parsed = urlparse(url)
        if parsed.scheme.lower() not in ("http", "https"):
            raise SSRFSecurityError(f"Prohibited URL scheme '{parsed.scheme}'. Only http and https are permitted.")

        hostname = parsed.hostname
        if not hostname:
            raise SSRFSecurityError("Invalid URL: hostname could not be determined.")

        hostname_lower = hostname.lower().strip("[]")
        if hostname_lower in BLOCKED_HOSTNAMES:
            raise SSRFSecurityError(f"Restricted hostname '{hostname}' is blocked by SSRF policy.")

        # Resolve hostname to all associated IP addresses
        try:
            addr_info = socket.getaddrinfo(hostname_lower, None)
            resolved_ips = {item[4][0] for item in addr_info}
        except (socket.gaierror, socket.herror) as e:
            logger.warning(f"DNS resolution failed for '{hostname}': {e}")
            raise SSRFSecurityError(f"DNS resolution failed for hostname '{hostname}'.")

        for ip_str in resolved_ips:
            try:
                ip_obj = ipaddress.ip_address(ip_str)
                # Check for loopback, private, link-local, multicast, reserved
                if (
                    ip_obj.is_loopback
                    or ip_obj.is_private
                    or ip_obj.is_link_local
                    or ip_obj.is_multicast
                    or ip_obj.is_reserved
                    or ip_obj.is_unspecified
                ):
                    raise SSRFSecurityError(
                        f"SSRF Protection: Access to IP '{ip_str}' (private/loopback/metadata) is strictly blocked."
                    )

                for blocked_net in BLOCKED_NETWORKS:
                    if ip_obj in blocked_net:
                        raise SSRFSecurityError(
                            f"SSRF Protection: Access to network '{blocked_net}' is strictly blocked."
                        )
            except ValueError as ve:
                raise SSRFSecurityError(f"Invalid IP representation: {ve}")

        return True, "URL validated successfully."

    @staticmethod
    def extract_article(url: str) -> Optional[Dict[str, Any]]:
        """
        Scrapes and extracts clean main-text and metadata from news URL
        using trafilatura with BeautifulSoup fallback.
        Enforces SSRF validation before making any network requests.
        """
        # Validate SSRF safety
        ScraperService.validate_url_safety(url)

        try:
            downloaded = trafilatura.fetch_url(url)
            if not downloaded:
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NakedTruth/1.0"}
                resp = httpx.get(url, headers=headers, timeout=10.0, follow_redirects=True)
                downloaded = resp.text

            text = trafilatura.extract(downloaded, include_comments=False, include_tables=False)
            metadata = trafilatura.extract_metadata(downloaded)

            title = metadata.title if metadata and metadata.title else "News Report"
            author = metadata.author if metadata and metadata.author else "Unknown"

            if not text:
                soup = BeautifulSoup(downloaded, "html.parser")
                paragraphs = [p.get_text() for p in soup.find_all("p")]
                text = "\n".join(paragraphs)

            return {
                "title": title,
                "author": author,
                "text": text,
                "url": url,
            }
        except SSRFSecurityError:
            raise
        except Exception as e:
            logger.error(f"Error scraping {url}: {e}")
            return None
