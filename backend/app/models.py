import json
from datetime import datetime, timezone

from werkzeug.security import generate_password_hash, check_password_hash

from app import db


def _utc_iso(dt):
    """Serialize a datetime as an ISO string with UTC indicator."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class TokenBlocklist(db.Model):
    """Stores revoked JWT token identifiers so they cannot be reused."""
    __tablename__ = "token_blocklist"

    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    avatar = db.Column(db.String(256), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "avatar": f"/api/auth/avatars/{self.avatar}" if self.avatar else None,
            "created_at": _utc_iso(self.created_at),
        }


class Project(db.Model):
    __tablename__ = "projects"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    suites = db.relationship("Suite", backref="project", cascade="all, delete-orphan", lazy=True)
    test_runs = db.relationship("TestRun", backref="project", cascade="all, delete-orphan", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "created_by": self.created_by,
            "created_at": _utc_iso(self.created_at),
            "updated_at": _utc_iso(self.updated_at),
        }


class Suite(db.Model):
    __tablename__ = "suites"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    cypress_path = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    sections = db.relationship("Section", backref="suite", cascade="all, delete-orphan", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "description": self.description,
            "cypress_path": self.cypress_path,
            "created_at": _utc_iso(self.created_at),
        }


class Section(db.Model):
    __tablename__ = "sections"

    id = db.Column(db.Integer, primary_key=True)
    suite_id = db.Column(db.Integer, db.ForeignKey("suites.id", ondelete="CASCADE"), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("sections.id", ondelete="CASCADE"), nullable=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    display_order = db.Column(db.Integer, default=0)

    children = db.relationship("Section", backref=db.backref("parent", remote_side=[id]),
                               cascade="all, delete-orphan", lazy=True)
    test_cases = db.relationship("TestCase", backref="section", cascade="all, delete-orphan", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "suite_id": self.suite_id,
            "parent_id": self.parent_id,
            "name": self.name,
            "description": self.description,
            "display_order": self.display_order,
        }


class TestCase(db.Model):
    __tablename__ = "test_cases"

    id = db.Column(db.Integer, primary_key=True)
    suite_id = db.Column(db.Integer, db.ForeignKey("suites.id", ondelete="CASCADE"), nullable=False)
    section_id = db.Column(db.Integer, db.ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)
    title = db.Column(db.String(500), nullable=False)
    case_type = db.Column(db.String(50), default="Functional")
    priority = db.Column(db.String(20), default="Medium")
    preconditions = db.Column(db.Text, nullable=True)
    steps = db.Column(db.Text, nullable=True)  # JSON string
    expected_result = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    results = db.relationship("TestResult", backref="test_case", passive_deletes=True, lazy=True)

    @property
    def steps_list(self):
        if not self.steps:
            return []
        try:
            parsed = json.loads(self.steps)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    @steps_list.setter
    def steps_list(self, value):
        self.steps = json.dumps(value)

    def to_dict(self):
        return {
            "id": self.id,
            "suite_id": self.suite_id,
            "section_id": self.section_id,
            "title": self.title,
            "case_type": self.case_type,
            "priority": self.priority,
            "preconditions": self.preconditions,
            "steps": self.steps_list,
            "expected_result": self.expected_result,
            "created_by": self.created_by,
            "updated_by": self.updated_by,
            "created_at": _utc_iso(self.created_at),
            "updated_at": _utc_iso(self.updated_at),
        }


class TestRun(db.Model):
    __tablename__ = "test_runs"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    suite_id = db.Column(db.Integer, db.ForeignKey("suites.id"), nullable=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    run_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime, nullable=True)
    is_completed = db.Column(db.Boolean, default=False)

    suite = db.relationship("Suite", backref="test_runs_rel")
    results = db.relationship("TestResult", backref="test_run", cascade="all, delete-orphan", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "suite_id": self.suite_id,
            "name": self.name,
            "description": self.description,
            "created_by": self.created_by,
            "run_date": _utc_iso(self.run_date),
            "created_at": _utc_iso(self.created_at),
            "completed_at": _utc_iso(self.completed_at),
            "is_completed": self.is_completed,
        }


class TestResult(db.Model):
    __tablename__ = "test_results"

    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(db.Integer, db.ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=False)
    case_id = db.Column(db.Integer, db.ForeignKey("test_cases.id", ondelete="SET NULL"), nullable=True)
    status = db.Column(db.String(20), default="Untested")
    comment = db.Column(db.Text, nullable=True)
    defect_id = db.Column(db.String(100), nullable=True)
    tested_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    tested_at = db.Column(db.DateTime, nullable=True)
    # CircleCI integration fields
    error_message = db.Column(db.Text, nullable=True)
    artifacts = db.Column(db.Text, nullable=True)  # JSON array of artifact URLs
    circleci_job_id = db.Column(db.String(100), nullable=True)

    history = db.relationship("ResultHistory", backref="result", cascade="all, delete-orphan", lazy=True,
                              order_by="ResultHistory.changed_at.desc()")

    @property
    def artifacts_list(self):
        if not self.artifacts:
            return []
        try:
            return json.loads(self.artifacts)
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    def to_dict(self):
        return {
            "id": self.id,
            "run_id": self.run_id,
            "case_id": self.case_id,
            "status": self.status,
            "comment": self.comment,
            "defect_id": self.defect_id,
            "tested_by": self.tested_by,
            "tested_at": _utc_iso(self.tested_at),
            "error_message": self.error_message,
            "artifacts": self.artifacts_list,
            "circleci_job_id": self.circleci_job_id,
        }


class ResultHistory(db.Model):
    __tablename__ = "result_history"

    id = db.Column(db.Integer, primary_key=True)
    result_id = db.Column(db.Integer, db.ForeignKey("test_results.id", ondelete="CASCADE"), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    comment = db.Column(db.Text, nullable=True)
    defect_id = db.Column(db.String(100), nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    artifacts = db.Column(db.Text, nullable=True)  # JSON array of artifact URLs
    changed_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    changed_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def artifacts_list(self):
        if not self.artifacts:
            return []
        try:
            return json.loads(self.artifacts)
        except (json.JSONDecodeError, TypeError, ValueError):
            return []

    def to_dict(self):
        return {
            "id": self.id,
            "result_id": self.result_id,
            "status": self.status,
            "comment": self.comment,
            "defect_id": self.defect_id,
            "error_message": self.error_message,
            "artifacts": self.artifacts_list,
            "changed_by": self.changed_by,
            "changed_at": _utc_iso(self.changed_at),
        }


class SyncBaseline(db.Model):
    """Daily snapshot of all case IDs — used as the comparison baseline for sync diffs."""
    __tablename__ = "sync_baselines"

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    case_ids = db.Column(db.Text, nullable=False)  # JSON array of case IDs
    case_titles = db.Column(db.Text, nullable=False)  # JSON dict: {case_id: "suite > section > title"}
    case_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def get_case_ids(self):
        return set(json.loads(self.case_ids)) if self.case_ids else set()

    def get_case_titles(self):
        return json.loads(self.case_titles) if self.case_titles else {}


class SyncLog(db.Model):
    """Records each Cypress sync or CircleCI import with summary details."""
    __tablename__ = "sync_logs"

    id = db.Column(db.Integer, primary_key=True)
    sync_type = db.Column(db.String(50), nullable=False)  # 'cypress_sync' or 'circleci_import'
    project_id = db.Column(db.Integer, db.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    total_cases = db.Column(db.Integer, default=0)
    new_cases = db.Column(db.Integer, default=0)
    removed_cases = db.Column(db.Integer, default=0)
    suites_processed = db.Column(db.Integer, default=0)
    new_case_names = db.Column(db.Text, nullable=True)  # JSON array of new case titles
    status = db.Column(db.String(20), default="success")  # 'success', 'partial', 'error'
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        new_names = []
        if self.new_case_names:
            try:
                new_names = json.loads(self.new_case_names)
            except Exception:
                new_names = []
        return {
            "id": self.id,
            "sync_type": self.sync_type,
            "project_id": self.project_id,
            "total_cases": self.total_cases,
            "new_cases": self.new_cases,
            "removed_cases": self.removed_cases,
            "suites_processed": self.suites_processed,
            "new_case_names": new_names,
            "status": self.status,
            "error_message": self.error_message,
            "created_at": _utc_iso(self.created_at),
        }
