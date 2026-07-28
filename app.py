import os
import threading
import time
import webbrowser

from db_compare import create_app


APP_URL = "http://127.0.0.1:5000"
app = create_app()


def _open_browser_when_ready() -> None:
    """Open the application in the default browser after Waitress starts."""
    time.sleep(1.5)
    webbrowser.open(APP_URL, new=2)


if __name__ == "__main__":
    from waitress import serve

    if os.environ.get("DSC_OPEN_BROWSER", "1") == "1":
        threading.Thread(target=_open_browser_when_ready, daemon=True).start()

    print(f"Data Sync Check is running at {APP_URL}")
    print("Press Ctrl+C to stop.")
    serve(app, host="127.0.0.1", port=5000, threads=4)
