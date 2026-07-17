import * as github from '@actions/github';
import { Provider } from './Provider.js';

export class GitHubProvider extends Provider {
  constructor(token) {
    super();
    this.octokit = github.getOctokit(token);
    this.context = github.context;
  }

  init() {
    console.log("Initialized GitHub Provider");
  }

  getContext() {
    const { owner, repo, number: pullNumber } = this.context.issue;
    const headSha = this.context.payload.pull_request?.head?.sha;
    return { owner, repo, pullNumber, headSha };
  }

  async getDiff() {
    const { owner, repo, pullNumber } = this.getContext();
    const { data: diff } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
      mediaType: {
        format: 'diff'
      }
    });
    return diff;
  }

  async getFileContent(path, ref) {
    const { owner, repo } = this.getContext();
    const { data: file } = await this.octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref
    });
    return Buffer.from(file.content, 'base64').toString('utf8');
  }

  async createReview(reviewData) {
    const { owner, repo, pullNumber } = this.getContext();
    await this.octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: reviewData.event,
      body: reviewData.body,
      comments: reviewData.comments
    });
  }

  async addLabel(label) {
    const { owner, repo, pullNumber } = this.getContext();
    try {
      await this.octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pullNumber,
        labels: [label]
      });
    } catch (err) {
      console.warn(`Could not add label ${label}: ${err.message}`);
    }
  }

  async getPRBody() {
    const { owner, repo, pullNumber } = this.getContext();
    const { data: pr } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
    });
    return pr.body || '';
  }

  async updatePRBody(body) {
    const { owner, repo, pullNumber } = this.getContext();
    await this.octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body
    });
  }
}
