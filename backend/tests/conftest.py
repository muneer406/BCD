"""
pytest configuration — adds backend root to sys.path so `app.*` imports work.
"""
import sys
import os

# Ensure the backend root (containing `app/`) is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
