"""Tests for dashboard routes in app/routes/dashboard.py."""

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
