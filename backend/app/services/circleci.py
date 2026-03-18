"""CircleCI API integration service for fetching test failure data and artifacts."""

import requests
from flask import current_app


class CircleCIService:
    BASE_URL = "https://circleci.com/api/v2"

    def __init__(self):
        self.token = None
        self.project_slug = None

    def _get_config(self):
        """Get CircleCI config from Flask app config."""
        self.token = current_app.config.get("CIRCLECI_API_TOKEN")
        self.project_slug = current_app.config.get("CIRCLECI_PROJECT_SLUG")

    def _headers(self):
        """Get authorization headers for CircleCI API."""
        return {
            "Circle-Token": self.token,
            "Content-Type": "application/json",
        }

    def is_configured(self):
        """Check if CircleCI integration is configured."""
        self._get_config()
        return bool(self.token and self.project_slug)

    def get_job_details(self, job_number):
        """
        Fetch job details from CircleCI.

        Args:
            job_number: The CircleCI job number

        Returns:
            dict with job status, steps output, etc.
        """
        if not self.is_configured():
            return None

        try:
            url = f"{self.BASE_URL}/project/{self.project_slug}/job/{job_number}"
            response = requests.get(url, headers=self._headers(), timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            current_app.logger.error(f"CircleCI API error fetching job {job_number}: {e}")
            return None

    def get_job_artifacts(self, job_number):
        """
        Fetch artifacts for a CircleCI job.

        Args:
            job_number: The CircleCI job number

        Returns:
            List of artifact dicts with path and url
        """
        if not self.is_configured():
            return []

        try:
            url = f"{self.BASE_URL}/project/{self.project_slug}/{job_number}/artifacts"
            response = requests.get(url, headers=self._headers(), timeout=10)
            response.raise_for_status()
            data = response.json()
            return data.get("items", [])
        except requests.RequestException as e:
            current_app.logger.error(f"CircleCI API error fetching artifacts for job {job_number}: {e}")
            return []

    def get_failed_tests_output(self, job_number):
        """
        Fetch failed test output from a CircleCI job.

        This fetches the job steps and extracts failure messages from test steps.

        Args:
            job_number: The CircleCI job number

        Returns:
            str: Error/failure message or None
        """
        if not self.is_configured():
            return None

        try:
            # First get the job to find the workflow/pipeline
            job_details = self.get_job_details(job_number)
            if not job_details:
                return None

            # Get test metadata if available
            url = f"{self.BASE_URL}/project/{self.project_slug}/{job_number}/tests"
            response = requests.get(url, headers=self._headers(), timeout=10)
            response.raise_for_status()
            data = response.json()

            # Extract failed test messages
            failed_tests = [t for t in data.get("items", []) if t.get("result") == "failure"]
            if failed_tests:
                messages = []
                for test in failed_tests[:5]:  # Limit to first 5 failures
                    name = test.get("name", "Unknown test")
                    message = test.get("message", "")
                    if message:
                        messages.append(f"{name}: {message[:500]}")  # Truncate long messages
                    else:
                        messages.append(f"{name}: Failed")
                return "\n\n".join(messages)

            return None
        except requests.RequestException as e:
            current_app.logger.error(f"CircleCI API error fetching test output for job {job_number}: {e}")
            return None

    def fetch_failure_data(self, job_number):
        """
        Fetch both error messages and artifacts for a failed job.

        Args:
            job_number: The CircleCI job number

        Returns:
            dict with 'error_message' and 'artifacts' keys
        """
        error_message = self.get_failed_tests_output(job_number)
        artifacts = self.get_job_artifacts(job_number)

        # Format artifacts as list of dicts with name and url
        formatted_artifacts = []
        for artifact in artifacts:
            formatted_artifacts.append({
                "name": artifact.get("path", "").split("/")[-1],
                "url": artifact.get("url"),
                "path": artifact.get("path"),
            })

        return {
            "error_message": error_message,
            "artifacts": formatted_artifacts,
        }


# Singleton instance
circleci_service = CircleCIService()
