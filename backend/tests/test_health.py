from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_signup_missing_fields():
    response = client.post("/auth/signup", json={})
    assert response.status_code == 422


def test_login_wrong_credentials():
    response = client.post(
        "/auth/login",
        data={"username": "fake@test.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401
