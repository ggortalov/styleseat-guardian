import pytest
import tempfile
import os

from app import create_app, db as _db


@pytest.fixture(scope="session")
def app():
    """Create a Flask application configured for testing."""
    app = create_app()
    app.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        TESTING=True,
        JWT_SECRET_KEY="test-secret-key",
        UPLOAD_FOLDER=tempfile.mkdtemp(),
        RATELIMIT_ENABLED=False,
    )

    # Disable Flask-Limiter for tests
    if hasattr(app, "extensions") and "limiter" in app.extensions:
        limiter_set = app.extensions["limiter"]
        for limiter in limiter_set:
            limiter.enabled = False

    with app.app_context():
        _db.create_all()
        yield app
        _db.drop_all()


@pytest.fixture(autouse=True)
def clean_db(app):
    """Roll back any pending transaction and clear all tables between tests."""
    with app.app_context():
        _db.session.rollback()
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()


@pytest.fixture
def client(app):
    """A Flask test client."""
    return app.test_client()


@pytest.fixture
def auth_headers(client):
    """Register a test user and return Authorization headers with a valid JWT."""
    client.post(
        "/api/auth/register",
        json={
            "username": "testuser",
            "email": "test@styleseat.com",
            "password": "TestPass123",
        },
    )
    resp = client.post(
        "/api/auth/login",
        json={
            "username": "testuser",
            "password": "TestPass123",
        },
    )
    token = resp.get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


def create_project(client, auth_headers, name="Test Project", description="A test project"):
    """Helper: create a project and return its JSON response."""
    resp = client.post(
        "/api/projects",
        json={"name": name, "description": description},
        headers=auth_headers,
    )
    return resp.get_json()


def create_suite(client, auth_headers, project_id, name="Test Suite"):
    """Helper: create a suite and return its JSON response."""
    resp = client.post(
        f"/api/projects/{project_id}/suites",
        json={"name": name, "description": "A test suite"},
        headers=auth_headers,
    )
    return resp.get_json()


def create_section(client, auth_headers, suite_id, name="Test Section", parent_id=None):
    """Helper: create a section and return its JSON response."""
    payload = {"name": name}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    resp = client.post(
        f"/api/suites/{suite_id}/sections",
        json=payload,
        headers=auth_headers,
    )
    return resp.get_json()


def create_test_case(client, auth_headers, suite_id, section_id, title="Test Case 1"):
    """Helper: create a test case and return its JSON response."""
    resp = client.post(
        "/api/cases",
        json={
            "title": title,
            "suite_id": suite_id,
            "section_id": section_id,
            "case_type": "Functional",
            "priority": "Medium",
            "preconditions": "User is logged in",
            "steps": [
                {"action": "Click button", "expected": "Dialog opens"},
                {"action": "Fill form", "expected": "Form accepts input"},
            ],
            "expected_result": "Operation succeeds",
        },
        headers=auth_headers,
    )
    return resp.get_json()


def create_test_run(client, auth_headers, project_id, suite_id, name="Test Run 1"):
    """Helper: create a test run and return its JSON response."""
    resp = client.post(
        f"/api/projects/{project_id}/runs",
        json={"name": name, "suite_id": suite_id},
        headers=auth_headers,
    )
    return resp.get_json()
