FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV TT_HOST=0.0.0.0
ENV TT_PORT=8080

EXPOSE 8080

CMD ["python", "-m", "app"]
