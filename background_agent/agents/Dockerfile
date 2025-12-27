FROM mcr.microsoft.com/powershell:7.4-ubuntu-22.04
WORKDIR /app
# Install python, pip, git, p7zip
RUN apt-get update \
	&& apt-get install -y python3 python3-pip git p7zip-full unzip --no-install-recommends \
	&& rm -rf /var/lib/apt/lists/*
COPY maintenance_agent.py /app/maintenance_agent.py
RUN python3 -m pip install --no-cache-dir requests
ENTRYPOINT ["pwsh", "-Command", "python3 /app/maintenance_agent.py"]
