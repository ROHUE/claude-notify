#!/usr/bin/env python3
"""
Claude Code Notification Hook - Extended Version
Sends notifications to both local tmux queue AND remote PWA server.

Installation:
1. Set CLAUDE_NOTIFY_URL environment variable to your server URL
2. Update your Claude Code settings to use this hook:
   {
     "hooks": {
       "Notification": [{
         "hooks": [{
           "type": "command",
           "command": "python3 /path/to/claude-notify-hook.py",
           "timeout": 10
         }]
       }]
     }
   }
"""

import subprocess
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path

# Configuration
NOTIFY_URL = os.environ.get('CLAUDE_NOTIFY_URL', '')
LOCAL_NOTIFY_CMD = os.path.expanduser('~/.local/bin/ai-notify')
LOG_FILE = Path.home() / '.local/share/ai-notifications/hook.log'


def log(msg):
    """Write to log file for debugging."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, 'a') as f:
        f.write(f'{datetime.now().isoformat()} - {msg}\n')


def get_tmux_info():
    """Get current tmux session and window name."""
    try:
        session = subprocess.check_output(
            ['tmux', 'display-message', '-p', '#{session_name}'],
            stderr=subprocess.DEVNULL
        ).decode().strip()

        window = subprocess.check_output(
            ['tmux', 'display-message', '-p', '#{window_name}'],
            stderr=subprocess.DEVNULL
        ).decode().strip()

        return session, window
    except Exception:
        return None, None


def send_to_local(session, window, message):
    """Send notification to local ai-notify queue."""
    if not os.path.exists(LOCAL_NOTIFY_CMD):
        log(f'Local notify command not found: {LOCAL_NOTIFY_CMD}')
        return False

    try:
        subprocess.run([LOCAL_NOTIFY_CMD, 'add', session, window, message])
        log(f'Sent to local: {session}/{window}')
        return True
    except Exception as e:
        log(f'Local notify error: {e}')
        return False


def send_to_remote(session, window, message, notification_type):
    """Send notification to remote PWA server."""
    if not NOTIFY_URL:
        log('CLAUDE_NOTIFY_URL not set, skipping remote')
        return False

    url = f'{NOTIFY_URL.rstrip("/")}/api/notify'

    payload = json.dumps({
        'session': session or '',
        'window': window or '',
        'message': message,
        'notification_type': notification_type
    }).encode('utf-8')

    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            log(f'Sent to remote: {result}')
            return True

    except urllib.error.URLError as e:
        log(f'Remote notify error: {e}')
        return False
    except Exception as e:
        log(f'Remote notify error: {e}')
        return False


def main():
    log('Hook called')

    # Parse input from Claude Code
    try:
        input_data = sys.stdin.read()
        log(f'Input: {input_data[:200] if input_data else "EMPTY"}')

        if input_data:
            data = json.loads(input_data)
            message = data.get('title', '') or data.get('message', 'Needs attention')
            notification_type = data.get('notification_type', 'general')
        else:
            message = 'Needs attention'
            notification_type = 'general'

    except Exception as e:
        log(f'Parse error: {e}')
        message = 'Needs attention'
        notification_type = 'general'

    # Get tmux context
    session, window = get_tmux_info()
    log(f'Tmux: session={session}, window={window}')

    # Send to both local and remote
    if session and window:
        send_to_local(session, window, message)

    send_to_remote(session, window, message, notification_type)


if __name__ == '__main__':
    main()
