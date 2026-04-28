from pydantic_settings import BaseSettings
from pydantic import EmailStr
from typing import Literal, Optional
from functools import lru_cache


class Settings(BaseSettings):
    # shared
    node_mode: Literal["directory", "storage"]
    node_version: str = "1.0.0"
    log_level: str = "info"
    tls_cert_path: str = "/certs/fullchain.pem"
    tls_key_path: str = "/certs/privkey.pem"
    host_os: Literal["linux", "windows", "macos"] = "linux"

    # directory mode
    node_ipv4: Optional[str] = None
    node_ipv6: Optional[str] = None
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

    # storage mode
    node_id: Optional[str] = None
    dir_node_ip: Optional[str] = None
    mapped_roots: str = ""
    replica_poll_base: int = 60
    replica_poll_jitter_max: int = 30
    watcher_debounce_ms: int = 2000
    thumbnail_cache_budget_mb: int = 500  # max thumbnail cache size in MB; 0 = unlimited
    embed_host: str = "local"
    ingestion_queue_path: str = "/data/ingest_queue"
    llm_host: Optional[str] = None

    @property
    def is_directory(self) -> bool:
        return self.node_mode == "directory"

    @property
    def is_storage(self) -> bool:
        return self.node_mode == "storage"

    @property
    def llm_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.llm_priority_hosts.split(",") if h.strip()]

    @property
    def mapped_roots_list(self) -> list[str]:
        return [r.strip() for r in self.mapped_roots.split(",") if r.strip()]

    @property
    def dir_node_contacts(self) -> list[str]:
        """Priority-ordered contact addresses for the directory node."""
        if not self.dir_node_ip:
            return []
        return [h.strip() for h in self.dir_node_ip.split(",") if h.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
