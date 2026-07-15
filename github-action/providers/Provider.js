export class Provider {
  constructor() {
    if (this.constructor === Provider) {
      throw new Error("Cannot instantiate abstract class Provider");
    }
  }

  /**
   * Initialize the provider (e.g. read environment variables, construct clients)
   */
  init() {
    throw new Error("Method 'init()' must be implemented.");
  }

  /**
   * Get standard context about the Pull Request / Merge Request
   * @returns {{ owner: string, repo: string, pullNumber: number, headSha: string }}
   */
  getContext() {
    throw new Error("Method 'getContext()' must be implemented.");
  }

  /**
   * Fetch the raw diff of the PR/MR
   * @returns {Promise<string>}
   */
  async getDiff() {
    throw new Error("Method 'getDiff()' must be implemented.");
  }

  /**
   * Fetch file content at a specific commit
   * @param {string} path 
   * @param {string} ref 
   * @returns {Promise<string>}
   */
  async getFileContent(path, ref) {
    throw new Error("Method 'getFileContent()' must be implemented.");
  }

  /**
   * Create a review or post comments on the PR/MR
   * @param {Object} reviewData 
   */
  async createReview(reviewData) {
    throw new Error("Method 'createReview()' must be implemented.");
  }

  /**
   * Add a label to the PR/MR
   * @param {string} label 
   */
  async addLabel(label) {
    throw new Error("Method 'addLabel()' must be implemented.");
  }

  /**
   * Get the PR/MR description body
   * @returns {Promise<string>}
   */
  async getPRBody() {
    throw new Error("Method 'getPRBody()' must be implemented.");
  }

  /**
   * Update the PR/MR description body
   * @param {string} body 
   */
  async updatePRBody(body) {
    throw new Error("Method 'updatePRBody()' must be implemented.");
  }
}
