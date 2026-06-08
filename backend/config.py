from pydantic_settings import BaseSettings
from pydantic import EmailStr
from typing import Literal, Optional
from functools import lru_cache


class Settings(BaseSettings):
    # shared
    node_version: str = "1.0.0"
    log_level: str = "info"
    tls_cert_path: str = "/certs/fullchain.pem"
    tls_key_path: str = "/certs/privkey.pem"
    host_os: Literal["linux", "windows", "macos"] = "linux"

    # directory mode (now active on all nodes)
    node_ip: Optional[str] = None
    self_node_id: Optional[str] = None        # identity for self-node bootstrap
    db_path: str = "/data/registry.db"
    vector_store_path: str = "/data/vectors"
    vector_store_backend: Literal["chroma", "qdrant", "pgvector"] = "chroma"
    jwt_secret: str
    jwt_expiry_hours: int = 24
    replica_push_interval: int = 60
    llm_priority_hosts: str = ""
    llm_health_check_interval: int = 30
    llm_model: str = "gemma3:4b"
    embed_model: str = "nomic-ai/nomic-embed-text-v1.5"
    serve_react: bool = True
    react_static_path: str = "/app/frontend/dist"

    # admin bootstrap
    admin_username: Optional[str] = None
    admin_email: Optional[EmailStr] = None
    admin_password: Optional[str] = None

    # node settings
    node_id: Optional[str] = None
    storage_roots: str = ""
    peer_nodes: str = ""
    replica_poll_base: int = 60
    replica_poll_jitter_max: int = 30
    watcher_debounce_ms: int = 2000
    thumbnail_cache_budget_mb: int = 500  # max thumbnail cache size in MB; 0 = unlimited
    embed_host: str = "local"
    ingestion_queue_path: str = "/data/ingest_queue"
    llm_host: Optional[str] = None

    @property
    def peer_nodes_list(self) -> list[tuple[str, list[str]]]:
        res = []
        if not self.peer_nodes:
            return res
        for item in self.peer_nodes.split(";"):
            if not item.strip():
                continue
            if "=" in item:
                parts = item.split("=", 1)
                if len(parts) == 2:
                    nid, addrs = parts
                    res.append((nid.strip(), [a.strip() for a in addrs.split(",") if a.strip()]))
        return res

    @property
    def node_mode(self) -> str:
        return "directory"

    @property
    def is_directory(self) -> bool:
        return True

    @property
    def is_storage(self) -> bool:
        return True

    @property
    def llm_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.llm_priority_hosts.split(",") if h.strip()]

    @property
    def storage_roots_list(self) -> list[str]:
        return [r.strip() for r in self.storage_roots.split(",") if r.strip()]

    @property
    def mapped_roots(self) -> str:
        return self.storage_roots

    @property
    def mapped_roots_list(self) -> list[str]:
        return self.storage_roots_list

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
