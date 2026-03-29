"""Tests for dashboard routes in app/routes/dashboard.py."""

from app import db
from app.models import TestCase, TestRun, TestResult

from tests.conftest import (
    create_project,
    create_suite,
    create_section,
    create_test_case,
    create_test_run,
)


class TestGlobalDashboard:
    """Tests for GET /api/dashboard."""

    def test_dashboard_empty(self, client, auth_headers):
        """Dashboard with no data returns empty structure."""
        resp = client.get("/api/dashboard", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "suites" in data
        assert "totals" in data
        assert "global_stats" in data
        assert "recent_runs" in data
        assert data["suites"] == []
        assert data["totals"]["suites"] == 0
        assert data["totals"]["cases"] == 0
        assert data["totals"]["runs"] == 0

    def test_dashboard_with_data(self, client, auth_headers):
        """Dashboard returns projects with stats, totals, and recent runs."""
        project = create_project(client, auth_headers, name="Dashboard Project")
        suite = create_suite(client, auth_headers, project["id"])
        section = create_section(client, auth_headers, suite["id"])
        create_test_case(client, auth_headers, suite["id"], section["id"], title="Dash Case 1")
        create_test_case(client, auth_headers, suite["id"], section["id"], title="Dash Case 2")
        create_test_run(client, auth_headers, project["id"], suite["id"], name="Dash Run")

        resp = client.get("/api/dashboard", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()

        assert data["totals"]["suites"] == 1
        assert data["totals"]["cases"] == 2
        assert data["totals"]["runs"] == 1

        # Global stats should reflect Untested results from the run
        assert data["global_stats"]["Untested"] == 2
        assert data["global_stats"]["total"] == 2

        # Suites should include stats
        assert len(data["suites"]) == 1
        suite = data["suites"][0]
        assert suite["name"] == "Test Suite"
        assert suite["case_count"] == 2
        assert suite["run_count"] == 1
        assert "stats" in suite

        # Recent runs should include the run
        assert len(data["recent_runs"]) == 1
        assert data["recent_runs"][0]["project_name"] == "Dashboard Project"

    def test_dashboard_requires_auth(self, client):
        """Dashboard without auth returns 401."""
        resp = client.get("/api/dashboard")
        assert resp.status_code == 401


class TestProjectDashboard:
    """Tests for GET /api/projects/:pid/dashboard."""

    def test_project_dashboard_empty(self, client, auth_headers):
        """Project dashboard with no runs returns empty stats."""
        project = create_project(client, auth_headers)

        resp = client.get(f"/api/projects/{project['id']}/dashboard", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "project" in data
        assert "runs" in data
        assert "overall_stats" in data
        assert data["project"]["name"] == "Test Project"
        assert data["runs"] == []
        assert data["overall_stats"]["total"] == 0

    def test_project_dashboard_with_runs(self, client, auth_headers):
        """Project dashboard returns runs with per-run stats and overall stats."""
        project = create_project(client, auth_headers)
        suite = create_suite(client, auth_headers, project["id"])
        section = create_section(client, auth_headers, suite["id"])
        create_test_case(client, auth_headers, suite["id"], section["id"], title="PD Case 1")
        create_test_case(client, auth_headers, suite["id"], section["id"], title="PD Case 2")
        run = create_test_run(client, auth_headers, project["id"], suite["id"])

        # Update one result to Passed
        results_resp = client.get(f"/api/runs/{run['id']}/results", headers=auth_headers)
        result_id = results_resp.get_json()[0]["id"]
        client.put(
            f"/api/results/{result_id}",
            json={"status": "Passed"},
            headers=auth_headers,
        )

        resp = client.get(f"/api/projects/{project['id']}/dashboard", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.get_json()

        assert len(data["runs"]) == 1
        run_data = data["runs"][0]
        assert "stats" in run_data
        assert run_data["stats"]["Passed"] == 1
        assert run_data["stats"]["Untested"] == 1
        assert run_data["stats"]["total"] == 2

        # Overall stats
        assert data["overall_stats"]["Passed"] == 1
        assert data["overall_stats"]["Untested"] == 1
        assert data["overall_stats"]["total"] == 2

    def test_project_dashboard_not_found(self, client, auth_headers):
        """Project dashboard for non-existent project returns 404."""
        resp = client.get("/api/projects/9999/dashboard", headers=auth_headers)
        assert resp.status_code == 404


class TestProjectDashboardDateFilter:
    """Tests for date filtering on GET /api/projects/:pid/dashboard."""

    def _auth_and_project(self, client, app):
        """Register user, create project + suite + section + case via API, return (headers, project, suite, case_id)."""
        from datetime import datetime, timezone

        client.post("/api/auth/register", json={
            "username": "dashfilter",
            "email": "dashfilter@styleseat.com",
            "password": "TestPass123",
        })
        resp = client.post("/api/auth/login", json={
            "username": "dashfilter",
            "password": "TestPass123",
        })
        token = resp.get_json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        proj = client.post("/api/projects", json={"name": "DateFilter Project", "description": "x"}, headers=headers).get_json()
        suite = client.post(f"/api/projects/{proj['id']}/suites", json={"name": "DateSuite", "description": "x"}, headers=headers).get_json()
        sec = client.post(f"/api/suites/{suite['id']}/sections", json={"name": "DateSection"}, headers=headers).get_json()
        tc = client.post("/api/cases", json={
            "title": "DF Case",
            "suite_id": suite["id"],
            "section_id": sec["id"],
        }, headers=headers).get_json()

        return headers, proj, suite, tc["id"]

    def _add_run_with_date(self, app, project_id, suite_id, case_id, run_date, status, name="Run"):
        """Insert a run with a specific run_date and a result via ORM."""
        from datetime import datetime, timezone

        with app.app_context():
            run = TestRun(
                project_id=project_id,
                suite_id=suite_id,
                name=f"{name} {run_date}",
                run_date=run_date,
                created_at=datetime.fromisoformat(f"{run_date}T10:00:00+00:00"),
            )
            db.session.add(run)
            db.session.flush()
            db.session.add(TestResult(run_id=run.id, case_id=case_id, status=status))
            db.session.commit()

    def test_date_filter_returns_correct_stats(self, client, app):
        """Filtering by date=2026-03-16 returns only that date's stats."""
        headers, proj, suite, case_id = self._auth_and_project(client, app)

        self._add_run_with_date(app, proj["id"], suite["id"], case_id, "2026-03-15", "Passed")
        self._add_run_with_date(app, proj["id"], suite["id"], case_id, "2026-03-16", "Failed")
        self._add_run_with_date(app, proj["id"], suite["id"], case_id, "2026-03-17", "Passed")

        resp = client.get(
            f"/api/projects/{proj['id']}/dashboard?date=2026-03-16",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.get_json()

        # suite_stats should reflect the Mar 16 run (Failed)
        assert len(data["suite_stats"]) >= 1
        stats = list(data["suite_stats"].values())[0]
        assert stats["run_date"] == "2026-03-16"
        assert stats["Failed"] >= 1

    def test_run_dates_sorted_newest_first(self, client, app):
        """run_dates list is sorted descending (newest first)."""
        headers, proj, suite, case_id = self._auth_and_project(client, app)

        self._add_run_with_date(app, proj["id"], suite["id"], case_id, "2026-03-15", "Passed")
        self._add_run_with_date(app, proj["id"], suite["id"], case_id, "2026-03-16", "Failed")
        self._add_run_with_date(app, proj["id"], suite["id"], case_id, "2026-03-17", "Passed")

        resp = client.get(
            f"/api/projects/{proj['id']}/dashboard",
            headers=headers,
        )
        data = resp.get_json()
        dates = data["run_dates"]
        assert len(dates) >= 3
        assert dates == sorted(dates, reverse=True)

    def test_mixed_run_date_and_created_at(self, client, app):
        """Runs with run_date string and created_at datetime both appear in run_dates."""
        from datetime import datetime, timezone

        headers, proj, suite, case_id = self._auth_and_project(client, app)

        # Run with explicit run_date string
        self._add_run_with_date(app, proj["id"], suite["id"], case_id, "2026-02-10", "Passed")

        # Run with only created_at (no run_date)
        with app.app_context():
            run2 = TestRun(
                project_id=proj["id"], suite_id=suite["id"],
                name="Created At Only", run_date=None,
                created_at=datetime(2026, 2, 12, 14, 0, 0, tzinfo=timezone.utc),
            )
            db.session.add(run2)
            db.session.flush()
            db.session.add(TestResult(run_id=run2.id, case_id=case_id, status="Failed"))
            db.session.commit()

        resp = client.get(
            f"/api/projects/{proj['id']}/dashboard",
            headers=headers,
        )
        data = resp.get_json()
        dates = data["run_dates"]
        assert "2026-02-10" in dates
        assert "2026-02-12" in dates
