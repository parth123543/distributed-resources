from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    api_base_url: str
    worker_email: str
    worker_password: str
    heartbeat_interval_seconds: int = 10
    redis_url: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = WorkerSettings()