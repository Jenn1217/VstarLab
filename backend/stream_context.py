import threading

_local = threading.local()

def set_stream_handler(handler):
    """Sets the stream handler for the current thread."""
    _local.handler = handler

def get_stream_handler():
    """Gets the stream handler for the current thread."""
    return getattr(_local, 'handler', None)
