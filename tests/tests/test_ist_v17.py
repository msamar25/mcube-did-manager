from datetime import datetime
from backend.main import IST
from backend.workflows import Workflows

def test_ist_offset():
    assert datetime.now(IST).isoformat().endswith('+05:30')

def test_call_time_utc_to_ist():
    assert Workflows.call_time('2026-10-19T20:11:18+00:00') == '2026-10-20T01:41:18+05:30'
