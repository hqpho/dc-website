import pytest
import os
from urllib.parse import urlparse

@pytest.fixture(scope="function")
def vcr_config():
    return {
        "record_mode": "once",
        "filter_headers": [
            ('x-api-key', 'FILTERED'),
            ('authorization', 'FILTERED')
        ],
        "before_record_request": before_record_request,
    }

def before_record_request(request):
    """
    Decide whether to record the request.
    We want to record requests to external services (Mixer, NL Server, Google APIs).
    We want to IGNORE requests to localhost that are NOT the NL Server (i.e. Website, Selenium).
    """
    url = request.url
    parsed = urlparse(url)
    host = parsed.hostname
    port = parsed.port

    # Whitelist

    # NL Server ports
    if port in [6060, 6070]:
        return request

    # Data Commons API
    if host and 'datacommons.org' in host:
        return request

    # Google APIs
    if host and 'googleapis.com' in host:
        return request

    # If it's localhost and NOT whitelisted above (NL), ignore it.
    if host in ['localhost', '127.0.0.1', '0.0.0.0']:
        return None

    # If it's some other external site, record it (e.g. if we fetch maps JS from google.com, though that's usually frontend)
    # Backend usually only talks to services.

    return request
