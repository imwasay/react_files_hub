import asyncio
import httpx
from jose import jwt
from datetime import datetime, timedelta

async def test():
    import os
    from dotenv import load_dotenv
    load_dotenv(".env")
    secret = os.environ.get("JWT_SECRET")
    token = jwt.encode({"node_id": "hassan", "exp": datetime.utcnow() + timedelta(minutes=5)}, secret, algorithm="HS256")
    
    headers = {"X-Federation-Token": token}
    path = "/mnt/documents/CC/Demystifying_the_Cloud.mp4"
    from urllib.parse import quote
    
    url = f"http://10.72.5.24:8000/internal/files?path={quote(path)}"
    print("Requesting:", url)
    async with httpx.AsyncClient() as client:
        r = await client.head(url, headers=headers)
        print("HEAD Response:", r.status_code, r.headers)
        r = await client.get(url, headers={"Range": "bytes=0-100", "X-Federation-Token": token})
        print("GET Response:", r.status_code)
        if r.status_code != 200 and r.status_code != 206:
            print("Error content:", r.text)

asyncio.run(test())
