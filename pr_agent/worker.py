import os
from multiprocessing import Process
import time

def process_pr(event):
    # placeholder: implement lint/run/tests/apply fixes
    print('Processing PR event', event)

def run_worker():
    print('Worker started')
    while True:
        # poll queue or listen for events
        time.sleep(5)

if __name__ == '__main__':
    run_worker()
