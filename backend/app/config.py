from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_chat_model: str = "gpt-4o-mini"

    embed_api_key: str = ""
    embed_base_url: str = ""
    embed_model: str = "text-embedding-3-small"
    embed_timeout_seconds: float = 8.0
    embed_max_retries: int = 0

    llm_timeout_seconds: float = 90.0
    llm_max_retries: int = 0

    storage_file: str = "./data/cards.json"
    collection_name: str = "failure_cards"

    @property
    def effective_embed_api_key(self) -> str:
        return self.embed_api_key or self.llm_api_key

    @property
    def effective_embed_base_url(self) -> str:
        return self.embed_base_url or self.llm_base_url

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_api_key)

    @property
    def embed_enabled(self) -> bool:
        return bool(self.effective_embed_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
