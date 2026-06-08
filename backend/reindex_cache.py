from database import SessionLocal
from models.file import File
from models.file_cache import FileCache
from agent.ingestion import index_file
import os

def run():
    db = SessionLocal()
    files = db.query(File).all()
    print(f"Checking {len(files)} files for cache re-indexing...")
    for f in files:
        cache_entry = db.query(FileCache).filter(FileCache.file_id == f.id).first()
        if cache_entry and os.path.exists(cache_entry.encrypted_path):
            print(f"Re-indexing {f.filename} from cache...")
            index_file(db, f.id, cache_entry.encrypted_path, f.filename, f.logical_path, f.mime_type)
        elif os.path.exists(f.real_path or ""):
            print(f"Re-indexing {f.filename} from origin...")
            index_file(db, f.id, f.real_path, f.filename, f.logical_path, f.mime_type)
    db.commit()
    print("Done!")

if __name__ == "__main__":
    run()
