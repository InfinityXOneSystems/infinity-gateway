import os
import json
from pathlib import Path

LOCAL_CRED_PATH = Path(r"C:/Users/JARVIS/AppData/Local/InfinityXOne/CredentialManager")


def load_from_local():
    try:
        if LOCAL_CRED_PATH.exists():
            # read all files in the directory and merge JSON
            result = {}
            for p in LOCAL_CRED_PATH.glob('*'):
                try:
                    data = json.loads(p.read_text())
                    result.update(data)
                except Exception:
                    continue
            return result
    except Exception:
        return None
    return None


def load_from_gcp(secret_name: str):
    try:
        from google.cloud import secretmanager
        client = secretmanager.SecretManagerServiceClient()
        project = os.environ.get('GCP_PROJECT')
        if not project:
            return None
        name = f"projects/{project}/secrets/{secret_name}/versions/latest"
        response = client.access_secret_version(name=name)
        payload = response.payload.data.decode('utf-8')
        return json.loads(payload)
    except Exception:
        return None
+        client = secretmanager.SecretManagerServiceClient()
+        name = client.secret_version_path(os.environ.get('GCP_PROJECT'), secret_name, 'latest')
+        response = client.access_secret_version(name=name)
+        payload = response.payload.data.decode('utf-8')
+        return json.loads(payload)
+    except Exception:
+        return None
+
+
+def load_secrets(secret_name: str = None):
+    # 1. local credential store
+    local = load_from_local()
+    if local:
+        return local
+
+    # 2. GCP Secret Manager
+    if secret_name and os.environ.get('GCP_PROJECT'):
+        gcp = load_from_gcp(secret_name)
+        if gcp:
+            return gcp
+
+    # 3. environment variables fallback
+    env = {}
+    env['BACKGROUND_AGENT_API_KEY'] = os.environ.get('BACKGROUND_AGENT_API_KEY')
+    env['POSTGRES_PASSWORD'] = os.environ.get('POSTGRES_PASSWORD')
+    return env
def load_secrets(secret_name: str = None):
    # 1. local credential store
    local = load_from_local()
    if local:
        return local

    # 2. GCP Secret Manager
    if secret_name and os.environ.get('GCP_PROJECT'):
        gcp = load_from_gcp(secret_name)
        if gcp:
            return gcp

    # 3. environment variables fallback
    env = {}
    env['BACKGROUND_AGENT_API_KEY'] = os.environ.get('BACKGROUND_AGENT_API_KEY')
    env['POSTGRES_PASSWORD'] = os.environ.get('POSTGRES_PASSWORD')
    return env
+
*** End Patch