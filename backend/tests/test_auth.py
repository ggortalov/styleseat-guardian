"""Tests for auth routes in app/routes/auth.py."""


class TestRegister:
    """Tests for POST /api/auth/register."""

    def test_register_success(self, client):
        """Successful registration returns 201 with user data and token."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@styleseat.com",
                "password": "ValidPass1",
            },
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["username"] == "newuser"
        assert "token" in data
        assert "id" in data

    def test_register_duplicate_username(self, client):
        """Registering with a duplicate username returns 403 with generic message."""
        client.post(
            "/api/auth/register",
            json={
                "username": "dupeuser",
                "email": "first@styleseat.com",
                "password": "ValidPass1",
            },
        )
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "dupeuser",
                "email": "second@styleseat.com",
                "password": "ValidPass1",
            },
        )
        assert resp.status_code == 403
        assert "Unable to create account" in resp.get_json()["error"]

    def test_register_duplicate_email(self, client):
        """Registering with a duplicate email returns 403 with generic message."""
        client.post(
            "/api/auth/register",
            json={
                "username": "user1",
                "email": "same@styleseat.com",
                "password": "ValidPass1",
            },
        )
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "user2",
                "email": "same@styleseat.com",
                "password": "ValidPass1",
            },
        )
        assert resp.status_code == 403

    def test_register_disallowed_domain(self, client):
        """Registering with a non-styleseat.com email returns 403 with same generic message."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "outsider",
                "email": "outsider@example.com",
                "password": "ValidPass1",
            },
        )
        assert resp.status_code == 403
        assert "Unable to create account" in resp.get_json()["error"]

    def test_register_disallowed_domain_same_as_duplicate(self, client):
        """Domain rejection and duplicate rejection are indistinguishable (OWASP)."""
        # First, create a user
        client.post(
            "/api/auth/register",
            json={
                "username": "existing",
                "email": "existing@styleseat.com",
                "password": "ValidPass1",
            },
        )
        # Attempt with bad domain
        bad_domain = client.post(
            "/api/auth/register",
            json={
                "username": "newname",
                "email": "newname@gmail.com",
                "password": "ValidPass1",
            },
        )
        # Attempt with duplicate username
        dupe_user = client.post(
            "/api/auth/register",
            json={
                "username": "existing",
                "email": "other@styleseat.com",
                "password": "ValidPass1",
            },
        )
        # Both must return identical status and message
        assert bad_domain.status_code == dupe_user.status_code == 403
        assert bad_domain.get_json()["error"] == dupe_user.get_json()["error"]

    def test_register_missing_fields(self, client):
        """Missing required fields returns 400."""
        resp = client.post("/api/auth/register", json={"username": "onlyuser"})
        assert resp.status_code == 400

    def test_register_empty_username(self, client):
        """Empty username returns 400."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "",
                "email": "a@styleseat.com",
                "password": "ValidPass1",
            },
        )
        assert resp.status_code == 400

    def test_register_weak_password_too_short(self, client):
        """Password shorter than 8 characters returns 400."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "shortpw",
                "email": "short@styleseat.com",
                "password": "Ab1",
            },
        )
        assert resp.status_code == 400
        data = resp.get_json()
        assert "password_errors" in data or "error" in data

    def test_register_weak_password_no_uppercase(self, client):
        """Password without uppercase returns 400."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "noupperuser",
                "email": "noupper@styleseat.com",
                "password": "alllower1",
            },
        )
        assert resp.status_code == 400

    def test_register_weak_password_no_lowercase(self, client):
        """Password without lowercase returns 400."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "noloweruser",
                "email": "nolower@styleseat.com",
                "password": "ALLUPPER1",
            },
        )
        assert resp.status_code == 400

    def test_register_weak_password_no_digit(self, client):
        """Password without a digit returns 400."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "nodigituser",
                "email": "nodigit@styleseat.com",
                "password": "NoDigitsHere",
            },
        )
        assert resp.status_code == 400

    def test_register_invalid_email(self, client):
        """Invalid email format returns 400."""
        resp = client.post(
            "/api/auth/register",
            json={
                "username": "bademail",
                "email": "not-an-email",
                "password": "ValidPass1",
            },
        )
        assert resp.status_code == 400


class TestLogin:
    """Tests for POST /api/auth/login."""

    def test_login_success(self, client):
        """Successful login returns 200 with token."""
        client.post(
            "/api/auth/register",
            json={
                "username": "loginuser",
                "email": "login@styleseat.com",
                "password": "TestPass123",
            },
        )
        resp = client.post(
            "/api/auth/login",
            json={"username": "loginuser", "password": "TestPass123"},
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert "token" in data
        assert data["username"] == "loginuser"

    def test_login_wrong_password(self, client):
        """Wrong password returns 401."""
        client.post(
            "/api/auth/register",
            json={
                "username": "wrongpw",
                "email": "wrongpw@styleseat.com",
                "password": "TestPass123",
            },
        )
        resp = client.post(
            "/api/auth/login",
            json={"username": "wrongpw", "password": "WrongPassword1"},
        )
        assert resp.status_code == 401

    def test_login_unknown_user(self, client):
        """Unknown username returns 401."""
        resp = client.post(
            "/api/auth/login",
            json={"username": "ghost", "password": "TestPass123"},
        )
        assert resp.status_code == 401


class TestMe:
    """Tests for GET /api/auth/me."""

    def test_me_with_token(self, client, auth_headers):
        """GET /api/auth/me with valid token returns user info."""
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@styleseat.com"
        assert "id" in data

    def test_me_without_token(self, client):
        """GET /api/auth/me without a token returns 401."""
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


class TestLogout:
    """Tests for POST /api/auth/logout."""

    def test_logout_blacklists_token(self, client):
        """After logout the token should be blacklisted and unusable."""
        # Register and login
        client.post(
            "/api/auth/register",
            json={
                "username": "logoutuser",
                "email": "logout@styleseat.com",
                "password": "TestPass123",
            },
        )
        login_resp = client.post(
            "/api/auth/login",
            json={"username": "logoutuser", "password": "TestPass123"},
        )
        token = login_resp.get_json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Logout
        logout_resp = client.post("/api/auth/logout", headers=headers)
        assert logout_resp.status_code == 200

        # Verify the token is now unusable
        me_resp = client.get("/api/auth/me", headers=headers)
        assert me_resp.status_code == 401