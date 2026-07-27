import { Provider } from './Provider.js';

export class GitLabProvider extends Provider {
  constructor(token, apiUrl = 'https://gitlab.com/api/v4') {
    super();
    this.token = token;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    
    // In GitLab CI, these environment variables are automatically set
    this.projectId = process.env.CI_PROJECT_ID;
    this.mrIid = process.env.CI_MERGE_REQUEST_IID;
    this.commitSha = process.env.CI_COMMIT_SHA;
  }

  init() {
    if (!this.projectId || !this.mrIid) {
      throw new Error("GitLab Provider requires CI_PROJECT_ID and CI_MERGE_REQUEST_IID environment variables.");
    }
    console.log(`Initialized GitLab Provider for Project ${this.projectId}, MR !${this.mrIid}`);
  }

  getContext() {
    return {
      owner: 'gitlab',
      repo: this.projectId,
      pullNumber: this.mrIid,
      headSha: this.commitSha
    };
  }

  async _fetch(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    const headers = {
      'PRIVATE-TOKEN': this.token,
      ...options.headers
    };
    
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GitLab API error: ${response.status} - ${errText}`);
    }
    return response;
  }

  async getDiff() {
    // Fetch MR changes
    const response = await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}/changes`);
    const data = await response.json();
    
    // We need to convert GitLab changes array into a unified diff format string, 
    // or we can adjust `parseDiff` to handle it.
    // For simplicity in keeping the core logic intact, we reconstruct a unified diff.
    let diffString = '';
    for (const change of data.changes) {
      diffString += `diff --git a/${change.old_path} b/${change.new_path}\n`;
      if (change.new_file) diffString += `new file mode 100644\n`;
      if (change.deleted_file) diffString += `deleted file mode 100644\n`;
      diffString += `--- ${change.old_path}\n`;
      diffString += `+++ ${change.new_path}\n`;
      diffString += `${change.diff}\n`;
    }
    return diffString;
  }

  async getFileContent(path, ref) {
    const encodedPath = encodeURIComponent(path);
    const response = await this._fetch(`/projects/${this.projectId}/repository/files/${encodedPath}/raw?ref=${ref}`);
    return await response.text();
  }

  async createReview(reviewData) {
    // Post the main body as a standard MR note
    if (reviewData.body) {
      await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reviewData.body })
      });
    }

    if (!reviewData.comments || reviewData.comments.length === 0) {
      return;
    }

    // GitLab requires the base commit SHA, head commit SHA, and start commit SHA to post a discussion on a diff.
    const mrRes = await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}`);
    const mrData = await mrRes.json();
    const baseSha = mrData.diff_refs.base_sha;
    const headSha = mrData.diff_refs.head_sha;
    const startSha = mrData.diff_refs.start_sha;

    for (const comment of reviewData.comments) {
      try {
        await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}/discussions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: comment.body,
            position: {
              position_type: 'text',
              base_sha: baseSha,
              head_sha: headSha,
              start_sha: startSha,
              new_path: comment.path,
              new_line: comment.line
            }
          })
        });
      } catch (err) {
        console.error(`Failed to post comment on ${comment.path}:${comment.line} - ${err.message}`);
      }
    }
  }

  async addLabel(label) {
    try {
      const mrRes = await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}`);
      const mrData = await mrRes.json();
      const labels = mrData.labels || [];
      if (!labels.includes(label)) {
        labels.push(label);
        await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labels: labels.join(',') })
        });
      }
    } catch (err) {
      console.warn(`Could not add label ${label}: ${err.message}`);
    }
  }

  async getPRBody() {
    const response = await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}`);
    const data = await response.json();
    return data.description || '';
  }

  async updatePRBody(body) {
    await this._fetch(`/projects/${this.projectId}/merge_requests/${this.mrIid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: body })
    });
  }
}
