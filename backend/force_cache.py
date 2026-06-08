import asyncio
from database import SessionLocal
from models.file import File
from models.file_cache import FileCache
from models.node import Node
from services.file_service import _bg_download_file
from config import get_settings

async def run():
    settings = get_settings()
    db = SessionLocal()
    
    self_node = db.query(Node).filter(Node.node_id == settings.self_node_id).first()
    if not self_node:
        print("Self node not found")
        return
        
    files = db.query(File).all()
    to_download = []
    
    for f in files:
        # Skip if owned by self node natively
        if f.node_id == self_node.id:
            continue
            
        ce = db.query(FileCache).filter(FileCache.file_id == f.id, FileCache.cached_on_node_id == self_node.id).first()
        if not ce:
            serve_node = f.node
            ips = [ip.strip() for ip in serve_node.node_ip.split(",") if ip.strip()] if serve_node.node_ip else []
            if not ips:
                continue
                
            cache_path = f"/data/cache/{f.id}"
            to_download.append({
                "file_id": f.id,
                "file_size_bytes": f.size_bytes,
                "file_real_path": f.real_path,
                "node_id": serve_node.node_id,
                "ips": ips,
                "cache_path": cache_path,
                "self_node_db_id": self_node.id
            })
            
    print(f"Found {len(to_download)} files missing from cache. Starting downloads...")
    db.close()
    
    for item in to_download:
        print(f"Downloading {item['file_id']}...")
        await _bg_download_file(**item)
        
    print("All downloads finished!")

if __name__ == "__main__":
    asyncio.run(run())
