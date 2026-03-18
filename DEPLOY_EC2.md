# EC2 Docker Deployment (Clean URL on Port 80)

This setup serves your app at:
- `http://YOUR_EC2_PUBLIC_IP`

No `:8080` or `:8000` in the URL.

## 1) Required EC2 security group inbound rules
Keep only these for now:
- `SSH` TCP `22` from your IP (recommended) or `0.0.0.0/0` if needed
- `HTTP` TCP `80` from `0.0.0.0/0`

Optional later:
- `HTTPS` TCP `443` from `0.0.0.0/0` (only when TLS is configured)

You can remove:
- custom TCP `8000`
- custom TCP `8080`

## 2) Prepare backend environment
On EC2, create/update:
- `backend/.env`

Minimum required keys:
```env
ANTHROPIC_API_KEY=your_real_key
PORT=8000
CORS_ORIGIN=*
SCRAPER_CONCURRENCY=4
SCRAPER_PAGE_TIMEOUT=60000
SCRAPER_DELAY=1500
```

## 3) Build and run
From project root:
```bash
docker compose up -d --build
```

## 4) Check status
```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

## 5) Open in browser
```text
http://YOUR_EC2_PUBLIC_IP
```

## 6) Update deployment after code changes
```bash
git pull
docker compose up -d --build
```

## 7) Stop
```bash
docker compose down
```
