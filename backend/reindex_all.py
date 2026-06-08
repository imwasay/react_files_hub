from database import SessionLocal
from models.file import File
from agent.ingestion import index_file

def run():
    db = SessionLocal()
    files = db.query(File).all()
    print(f"Reindexing {len(files)} files...")
    for f in files:
        index_file(db, f.id, f.real_path, f.filename, f.logical_path, f.mime_type)
    db.commit()
    print("Done!")

if __name__ == "__main__":
    run()
