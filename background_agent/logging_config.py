import logging
from pythonjsonlogger import jsonlogger

def configure_logging(name=None):
    logger = logging.getLogger(name)
    handler = logging.StreamHandler()
    fmt = jsonlogger.JsonFormatter('%(asctime)s %(levelname)s %(name)s %(message)s')
    handler.setFormatter(fmt)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger
