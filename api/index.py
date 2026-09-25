import sys
import os

# Add parent directory to path so we can import app.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, init_db

# Initialize DB safely on cold start
try:
    init_db()
except Exception as e:
    print(f"Serverless DB init notice: {e}")

# Vercel expects the WSGI app to be named 'app'

