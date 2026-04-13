from pydantic_settings import BaseSettings
from pydantic import EmailStr
from typing import Literal, Optional
from functools import lru_cache


class Settings(BaseSettings):
    # shared
    node_mode: Literal["directory", "storage", "vps-edge", "offline-demo"]
    node_version: str = "1.0.0"
    log_level: str = "info"
    tls_cert_path: str = "/certs/fullchain.pem"
    tls_key_path: str = "/certs/privkey.pem"
    host_os: Literal["linux", "windows", "macos"] = "linux"

    # directory mode
    domain: Optional[str] = None
    node_public_ipv4: Optional[str] = None
    node_public_ipv6: Optional[str] = None
    node_wg_ip: Optional[str] = None
    db_path: str = "/data/registry.db"
    vector_store_path: str = "/data/vectors"
    vector_store_backend: Literal["chroma", "qdrant", "pgvector"] = "chroma"
    jwt_secret: str
    jwt_expiry_hours: int = 24
    replica_push_interval: int = 60
    llm_priority_hosts: str = ""
    llm_health_check_interval: int = 30
    llm_model: str = "gemma3:4b"
    embed_model: str = "nomic-embed-text"
    serve_react: bool = True
    react_static_path: str = "/app/frontend/dist"

    # admin bootstrap
    admin_username: Optional[str] = None
    admin_email: Optional[EmailStr] = None
    admin_password: Optional[str] = None

    # storage mode
    node_id: Optional[str] = None
    node_public_ipv6_storage: Optional[str] = None
    node_subdomain: Optional[str] = None
    dir_node_wg_ip: Optional[str] = None
    dir_node_ipv6: Optional[str] = None
    dir_node_ipv4: Optional[str] = None
    mapped_roots: str = ""
    replica_poll_base: int = 60
    replica_poll_jitter_max: int = 30
    watcher_debounce_ms: int = 2000
    embed_host: str = "local"
    ingestion_queue_path: str = "/data/ingest_queue"
    llm_host: Optional[str] = None

    # vps-edge mode
    registry_cache_path: str = "/data/registry_cache.json"
    registry_cache_ttl: int = 120
    proxy_fallback: bool = True

    # offline-demo overlay
    force_ipv4: bool = False
    local_dns_override: bool = False
    pihole_host: Optional[str] = None
    pihole_api_key: Optional[str] = None
    dir_node_lan_ip: Optional[str] = None
    lan_subnet: Optional[str] = None

    @property
    def is_directory(self) -> bool:
        return self.node_mode == "directory"

    @property
    def is_storage(self) -> bool:
        return self.node_mode in ("storage", "offline-demo")

    @property
    def llm_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.llm_priority_hosts.split(",") if h.strip()]

    @property
    def mapped_roots_list(self) -> list[str]:
        return [r.strip() for r in self.mapped_roots.split(",") if r.strip()]

    @property
    def dir_node_contacts(self) -> list[str]:
        """Priority-ordered contact addresses for the directory node."""
        contacts = []
        if self.dir_node_wg_ip:
            contacts.append(self.dir_node_wg_ip)
        if self.dir_node_ipv6:
            contacts.append(self.dir_node_ipv6)
        if self.dir_node_ipv4:
            contacts.append(self.dir_node_ipv4)
        return contacts

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
