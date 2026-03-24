const API_BASE = 'http://localhost:5001/api';

export class ApiClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  static async login(username = 'demo', password = 'Demo1234'): Promise<ApiClient> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    const data = await res.json();
    return new ApiClient(data.token);
  }

  private async request(method: string, path: string, body?: unknown) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }
    return res.status === 204 ? null : res.json();
  }

  get token_value() {
    return this.token;
  }

  // Projects
  async getProjects() {
    return this.request('GET', '/projects');
  }

  async createProject(name: string, description = '') {
    return this.request('POST', '/projects', { name, description });
  }

  async deleteProject(id: number) {
    return this.request('DELETE', `/projects/${id}`);
  }

  // Suites
  async getSuites(projectId: number) {
    return this.request('GET', `/projects/${projectId}/suites`);
  }

  async createSuite(projectId: number, name: string, description = '') {
    return this.request('POST', `/projects/${projectId}/suites`, { name, description });
  }

  async deleteSuite(id: number) {
    return this.request('DELETE', `/suites/${id}`);
  }

  // Sections
  async getSections(suiteId: number) {
    return this.request('GET', `/suites/${suiteId}/sections`);
  }

  async createSection(suiteId: number, name: string, parentId?: number) {
    return this.request('POST', `/suites/${suiteId}/sections`, {
      name,
      parent_id: parentId ?? null,
    });
  }

  async deleteSection(id: number) {
    return this.request('DELETE', `/sections/${id}`);
  }

  // Test Cases
  async getCases(suiteId: number) {
    return this.request('GET', `/suites/${suiteId}/cases`);
  }

  async createCase(fields: {
    title: string;
    section_id: number;
    suite_id: number;
    case_type?: string;
    priority?: string;
    preconditions?: string;
    steps?: { action: string; expected: string }[];
    expected_result?: string;
  }) {
    return this.request('POST', '/cases', fields);
  }

  async deleteCase(id: number) {
    return this.request('DELETE', `/cases/${id}`);
  }

  // Test Runs
  async getRuns(projectId: number) {
    return this.request('GET', `/projects/${projectId}/runs`);
  }

  async createRun(projectId: number, name: string, suiteId: number) {
    return this.request('POST', `/projects/${projectId}/runs`, {
      name,
      suite_id: suiteId,
    });
  }

  async getRun(runId: number) {
    return this.request('GET', `/runs/${runId}`);
  }

  async getRunResults(runId: number) {
    return this.request('GET', `/runs/${runId}/results`);
  }

  async updateResult(resultId: number, status: string, comment = '') {
    return this.request('PUT', `/results/${resultId}`, { status, comment });
  }

  async deleteRun(id: number) {
    return this.request('DELETE', `/runs/${id}`);
  }

  // Import
  async importCircleCI(workflowUrl: string) {
    return this.request('POST', '/runs/import-circleci', { workflow_url: workflowUrl });
  }

  async getImportStatus(): Promise<{ running: boolean; output: string; exit_code?: number; success?: boolean }> {
    return this.request('GET', '/runs/import-status');
  }

  // Dashboard / Sync logs
  async getSyncLogs(projectId?: number, limit = 20) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (projectId) params.set('project_id', String(projectId));
    return this.request('GET', `/sync-logs?${params}`);
  }
}
