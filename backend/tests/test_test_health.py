"""Tests for the test-health analysis endpoint and its helper functions."""

from datetime import datetime, timezone, timedelta

import pytest

from app import db
from app.models import Project, Suite, Section, TestCase, TestRun, TestResult, User
from app.routes.test_runs import _compute_ewma_flip_rate, _classify_error


# ===========================================================================
# Unit tests for _compute_ewma_flip_rate
# ===========================================================================


class TestEwmaFlipRate:
    """Unit tests for _compute_ewma_flip_rate helper."""

    def test_empty_statuses(self):
        assert _compute_ewma_flip_rate([]) == 0.0

    def test_single_status(self):
        assert _compute_ewma_flip_rate(["Passed"]) == 0.0

    def test_all_same_status(self):
        assert _compute_ewma_flip_rate(["Passed"] * 10) == 0.0

    def test_alternating_high_flip_rate(self):
        statuses = ["Passed", "Failed"] * 5
        rate = _compute_ewma_flip_rate(statuses)
        assert rate > 0.3, f"Alternating P/F should give high rate, got {rate}"

    def test_blocked_not_counted_as_flip(self):
        statuses = ["Passed", "Blocked", "Passed", "Blocked", "Passed"]
        rate = _compute_ewma_flip_rate(statuses)
        assert rate == 0.0, f"Blocked transitions should not flip, got {rate}"

    def test_single_flip_moderate(self):
        statuses = ["Passed", "Passed", "Passed", "Failed", "Failed"]
        rate = _compute_ewma_flip_rate(statuses)
        assert 0 < rate < 0.5, f"One flip should be moderate, got {rate}"


# ===========================================================================
# Unit tests for _classify_error
# ===========================================================================


class TestClassifyError:

    def test_timeout_detected(self):
        assert _classify_error("Timed out retrying after 4000ms") == "timeout"

    def test_assertion_detected(self):
        assert _classify_error("AssertionError: expected true to equal false") == "assertion"

    def test_element_not_found(self):
        assert _classify_error("Element [data-cy=btn] not found in DOM") == "element_not_found"

    def test_none_returns_none(self):
        assert _classify_error(None) is None

    def test_unknown_returns_none(self):
        assert _classify_error("some completely random log line xyz") is None


# ===========================================================================
# Integration tests for GET /api/projects/:pid/test-health
# ===========================================================================


class TestTestHealthEndpoint:
    """Integration tests for the test-health endpoint."""

    def _setup(self, client):
        """Register user via API, create project/suite/section/case via API, return (headers, ids)."""
        client.post("/api/auth/register", json={
            "username": "healthtester",
            "email": "ht@styleseat.com",
            "password": "TestPass123",
        })
        resp = client.post("/api/auth/login", json={
            "username": "healthtester",
            "password": "TestPass123",
        })
        token = resp.get_json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        proj = client.post("/api/projects", json={
            "name": "Health Project", "description": "x",
        }, headers=headers).get_json()

        suite = client.post(f"/api/projects/{proj['id']}/suites", json={
            "name": "P0", "description": "x", "cypress_path": "cypress/e2e/p0/",
        }, headers=headers).get_json()

        sec = client.post(f"/api/suites/{suite['id']}/sections", json={
            "name": "Default Section",
        }, headers=headers).get_json()

        return headers, proj["id"], suite["id"], sec["id"]

    def _create_case(self, client, headers, suite_id, section_id, title):
        resp = client.post("/api/cases", json={
            "title": title,
            "suite_id": suite_id,
            "section_id": section_id,
        }, headers=headers)
        return resp.get_json()["id"]

    def _add_run_with_results(self, app, project_id, suite_id, case_ids_statuses,
                               run_offset_days=0, commit_sha="abc123"):
        """Create a completed run via ORM and add results for each (case_id, status, error_msg)."""
        with app.app_context():
            ts = datetime.now(timezone.utc) - timedelta(days=run_offset_days)
            run = TestRun(
                project_id=project_id,
                suite_id=suite_id,
                name=f"Run offset={run_offset_days}",
                is_completed=True,
                circleci_workflow_id=f"wf-{run_offset_days}-{id(object())}",
                commit_sha=commit_sha,
                created_at=ts,
                run_date=ts.strftime("%Y-%m-%d"),
            )
            db.session.add(run)
            db.session.flush()
            for case_id, status, error_msg in case_ids_statuses:
                db.session.add(TestResult(
                    run_id=run.id,
                    case_id=case_id,
                    status=status,
                    error_message=error_msg,
                ))
            db.session.commit()

    # ── Insufficient runs ──

    def test_insufficient_runs(self, client, app):
        headers, pid, sid, sec_id = self._setup(client)
        cid = self._create_case(client, headers, sid, sec_id, "Case A")
        for i in range(3):
            self._add_run_with_results(app, pid, sid, [(cid, "Passed", None)], run_offset_days=i)

        resp = client.get(f"/api/projects/{pid}/test-health", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["confidence"] == "insufficient"
        assert data["tests"] == []

    # ── Always-failing ──

    def test_always_failing(self, client, app):
        headers, pid, sid, sec_id = self._setup(client)
        cid = self._create_case(client, headers, sid, sec_id, "Always Fail Case")
        for i in range(6):
            self._add_run_with_results(app, pid, sid,
                [(cid, "Failed", "Timed out retrying after 4000ms")],
                run_offset_days=i)

        resp = client.get(f"/api/projects/{pid}/test-health", headers=headers)
        data = resp.get_json()
        assert data["summary"]["always_failing"] >= 1

    # ── Flaky ──

    def test_flaky_classification(self, client, app):
        headers, pid, sid, sec_id = self._setup(client)
        cid = self._create_case(client, headers, sid, sec_id, "Flaky Case")
        statuses = ["Passed", "Failed", "Passed", "Failed", "Passed", "Failed"]
        for i, st in enumerate(statuses):
            self._add_run_with_results(app, pid, sid, [(cid, st, None)], run_offset_days=i)

        resp = client.get(f"/api/projects/{pid}/test-health", headers=headers)
        data = resp.get_json()
        assert data["summary"]["flaky"] >= 1

    # ── Healthy tests excluded from response ──

    def test_healthy_not_in_output(self, client, app):
        headers, pid, sid, sec_id = self._setup(client)
        cid = self._create_case(client, headers, sid, sec_id, "Healthy Case")
        for i in range(6):
            self._add_run_with_results(app, pid, sid, [(cid, "Passed", None)], run_offset_days=i)

        resp = client.get(f"/api/projects/{pid}/test-health", headers=headers)
        data = resp.get_json()
        for t in data["tests"]:
            assert t["category"] != "healthy"

    # ── Suite exclusion (no filter) ──

    def test_excluded_suite_not_analyzed(self, client, app):
        """Suite with cypress_path='cypress/e2e/abTest/' is excluded by default."""
        headers, pid, sid, sec_id = self._setup(client)
        # Create excluded suite via API
        excluded = client.post(f"/api/projects/{pid}/suites", json={
            "name": "AB Test", "description": "x", "cypress_path": "cypress/e2e/abTest/",
        }, headers=headers).get_json()
        ex_sec = client.post(f"/api/suites/{excluded['id']}/sections", json={
            "name": "AB Section",
        }, headers=headers).get_json()
        cid = self._create_case(client, headers, excluded["id"], ex_sec["id"], "AB Case")
        for i in range(6):
            self._add_run_with_results(app, pid, excluded["id"],
                [(cid, "Failed", None)], run_offset_days=i)

        resp = client.get(f"/api/projects/{pid}/test-health", headers=headers)
        data = resp.get_json()
        titles = [t["title"] for t in data["tests"]]
        assert "AB Case" not in titles

    # ── Suite exclusion bypassed with suite_id filter ──

    def test_excluded_suite_included_when_filtered(self, client, app):
        headers, pid, sid, sec_id = self._setup(client)
        excluded = client.post(f"/api/projects/{pid}/suites", json={
            "name": "AB Test2", "description": "x", "cypress_path": "cypress/e2e/abTest/",
        }, headers=headers).get_json()
        ex_sec = client.post(f"/api/suites/{excluded['id']}/sections", json={
            "name": "AB Section2",
        }, headers=headers).get_json()
        cid = self._create_case(client, headers, excluded["id"], ex_sec["id"], "AB Case Filtered")
        for i in range(6):
            self._add_run_with_results(app, pid, excluded["id"],
                [(cid, "Failed", None)], run_offset_days=i)

        resp = client.get(
            f"/api/projects/{pid}/test-health?suite_id={excluded['id']}",
            headers=headers,
        )
        data = resp.get_json()
        titles = [t["title"] for t in data["tests"]]
        assert "AB Case Filtered" in titles

    # ── MAX_RUNS_PER_SUITE limiting ──

    def test_max_runs_per_suite_limiting(self, client, app):
        """Only last MAX_RUNS_PER_SUITE runs are analysed; old failures are ignored."""
        headers, pid, sid, sec_id = self._setup(client)
        cid = self._create_case(client, headers, sid, sec_id, "Limited Case")
        # 15 runs: first 5 all-fail (older), last 10 all-pass (recent)
        for i in range(15):
            status = "Failed" if i < 5 else "Passed"
            self._add_run_with_results(app, pid, sid,
                [(cid, status, None)], run_offset_days=14 - i)

        resp = client.get(f"/api/projects/{pid}/test-health", headers=headers)
        data = resp.get_json()
        assert data["summary"]["always_failing"] == 0

    # ── Window parameter ──

    def test_window_parameter(self, client, app):
        """Runs outside the window are excluded."""
        headers, pid, sid, sec_id = self._setup(client)
        cid = self._create_case(client, headers, sid, sec_id, "Window Case")
        # 6 runs within last 7 days — all pass
        for i in range(6):
            self._add_run_with_results(app, pid, sid, [(cid, "Passed", None)], run_offset_days=i)
        # 6 runs from 50-60 days ago — all fail
        for i in range(6):
            self._add_run_with_results(app, pid, sid, [(cid, "Failed", None)], run_offset_days=50 + i)

        resp = client.get(f"/api/projects/{pid}/test-health?window=7", headers=headers)
        data = resp.get_json()
        assert data["summary"]["always_failing"] == 0

    # ── Auth required ──

    def test_auth_required(self, client, app):
        # Create project via API with temp auth
        client.post("/api/auth/register", json={
            "username": "authtester",
            "email": "at@styleseat.com",
            "password": "TestPass123",
        })
        resp = client.post("/api/auth/login", json={
            "username": "authtester",
            "password": "TestPass123",
        })
        token = resp.get_json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        proj = client.post("/api/projects", json={"name": "AuthProj", "description": "x"}, headers=h).get_json()

        # Request without auth
        resp = client.get(f"/api/projects/{proj['id']}/test-health")
        assert resp.status_code == 401
