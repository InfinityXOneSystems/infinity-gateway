import shutil, time
src = r'C:\AI\repos\mcp'
dst = r'C:\AI\repos\infinity-gateway'
for i in range(5):
    try:
        shutil.move(src, dst)
        print('Moved', src, '->', dst)
        break
    except Exception as e:
        print('Move attempt', i+1, 'failed:', e)
        time.sleep(1)
else:
    raise SystemExit('Failed to move after retries')
