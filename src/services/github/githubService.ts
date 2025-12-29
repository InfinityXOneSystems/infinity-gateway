/**
 * GitHub Service - GitHub App Integration Gateway
 * Full GitHub API access with app authentication
 */

import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';

export interface GitHubConfig {
  appId?: string;
  privateKey?: string;
  webhooksSecret?: string;
  installationId?: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  owner: {
    login: string;
    id: number;
    type: 'User' | 'Organization';
  };
  private: boolean;
  htmlUrl: string;
  description?: string;
  language?: string;
  createdAt: Date;
  updatedAt: Date;
  pushedAt?: Date;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  merged: boolean;
  mergeable?: boolean;
  user: {
    login: string;
    id: number;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  createdAt: Date;
  updatedAt: Date;
  mergedAt?: Date;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    id: number;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface GitHubWebhookEvent {
  action: string;
  repository?: GitHubRepository;
  sender: {
    login: string;
    id: number;
  };
  [key: string]: any;
}

export class GitHubService {
  private config: GitHubConfig;
  private app?: App;
  private octokit?: Octokit;
  private installationOctokit?: Octokit;

  constructor(config: GitHubConfig = {}) {
    this.config = config;

    if (config.appId && config.privateKey) {
      this.initializeApp();
    }
  }

  private initializeApp(): void {
    try {
      this.app = new App({
        appId: this.config.appId!,
        privateKey: this.config.privateKey!,
        webhooks: {
          secret: this.config.webhooksSecret
        }
      });

      // Get app-level Octokit for app operations
      this.octokit = new Octokit({
        auth: this.config.privateKey
      });

      // Get installation Octokit if installation ID is provided
      if (this.config.installationId) {
        this.getInstallationOctokit(this.config.installationId);
      }
    } catch (error) {
      console.error('Failed to initialize GitHub App:', error);
    }
  }

  private async getInstallationOctokit(installationId: number): Promise<Octokit> {
    if (!this.app) throw new Error('GitHub App not initialized');

    if (!this.installationOctokit) {
      this.installationOctokit = await this.app.getInstallationOctokit(installationId);
    }

    return this.installationOctokit;
  }

  // Repository Operations
  public async listRepositories(): Promise<GitHubRepository[]> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.apps.listReposAccessibleToInstallation();
      return data.repositories.map(repo => this.transformRepository(repo));
    } catch (error) {
      console.error('Failed to list repositories:', error);
      return [];
    }
  }

  public async getRepository(owner: string, repo: string): Promise<GitHubRepository | null> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.repos.get({ owner, repo });
      return this.transformRepository(data);
    } catch (error) {
      console.error('Failed to get repository:', error);
      return null;
    }
  }

  public async createRepository(name: string, options: {
    description?: string;
    private?: boolean;
    autoInit?: boolean;
  } = {}): Promise<GitHubRepository | null> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.repos.createInOrg({
        org: await this.getInstallationOwner(),
        name,
        description: options.description,
        private: options.private,
        auto_init: options.autoInit
      });
      return this.transformRepository(data);
    } catch (error) {
      console.error('Failed to create repository:', error);
      return null;
    }
  }

  // Pull Request Operations
  public async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubPullRequest[]> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.pulls.list({
        owner,
        repo,
        state,
        per_page: 100
      });
      return data.map(pr => this.transformPullRequest(pr));
    } catch (error) {
      console.error('Failed to list pull requests:', error);
      return [];
    }
  }

  public async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest | null> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.pulls.get({
        owner,
        repo,
        pull_number: number
      });
      return this.transformPullRequest(data);
    } catch (error) {
      console.error('Failed to get pull request:', error);
      return null;
    }
  }

  public async createPullRequest(owner: string, repo: string, options: {
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
  }): Promise<GitHubPullRequest | null> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.pulls.create({
        owner,
        repo,
        title: options.title,
        head: options.head,
        base: options.base,
        body: options.body,
        draft: options.draft
      });
      return this.transformPullRequest(data);
    } catch (error) {
      console.error('Failed to create pull request:', error);
      return null;
    }
  }

  public async mergePullRequest(owner: string, repo: string, number: number, options: {
    mergeMethod?: 'merge' | 'squash' | 'rebase';
    commitTitle?: string;
    commitMessage?: string;
  } = {}): Promise<boolean> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.pulls.merge({
        owner,
        repo,
        pull_number: number,
        merge_method: options.mergeMethod,
        commit_title: options.commitTitle,
        commit_message: options.commitMessage
      });
      return data.merged;
    } catch (error) {
      console.error('Failed to merge pull request:', error);
      return false;
    }
  }

  // Issue Operations
  public async listIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubIssue[]> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.issues.listForRepo({
        owner,
        repo,
        state,
        per_page: 100
      });
      return data.map(issue => this.transformIssue(issue));
    } catch (error) {
      console.error('Failed to list issues:', error);
      return [];
    }
  }

  public async createIssue(owner: string, repo: string, options: {
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<GitHubIssue | null> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.issues.create({
        owner,
        repo,
        title: options.title,
        body: options.body,
        labels: options.labels,
        assignees: options.assignees
      });
      return this.transformIssue(data);
    } catch (error) {
      console.error('Failed to create issue:', error);
      return null;
    }
  }

  // File Operations
  public async getFile(owner: string, repo: string, path: string, ref?: string): Promise<any> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      if (Array.isArray(data)) {
        return data; // Directory listing
      } else {
        return {
          name: data.name,
          path: data.path,
          content: Buffer.from(data.content, 'base64').toString('utf8'),
          encoding: data.encoding,
          size: data.size,
          sha: data.sha
        };
      }
    } catch (error) {
      console.error('Failed to get file:', error);
      return null;
    }
  }

  public async createOrUpdateFile(owner: string, repo: string, path: string, options: {
    content: string;
    message: string;
    branch?: string;
    sha?: string; // Required for updates
  }): Promise<any> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: options.message,
        content: Buffer.from(options.content).toString('base64'),
        branch: options.branch,
        sha: options.sha
      });
      return data;
    } catch (error) {
      console.error('Failed to create/update file:', error);
      throw error;
    }
  }

  public async deleteFile(owner: string, repo: string, path: string, options: {
    message: string;
    sha: string;
    branch?: string;
  }): Promise<boolean> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      await this.installationOctokit.repos.deleteFile({
        owner,
        repo,
        path,
        message: options.message,
        sha: options.sha,
        branch: options.branch
      });
      return true;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  // Webhook Handling
  public async handleWebhook(headers: any, body: any): Promise<any> {
    if (!this.app) throw new Error('GitHub App not initialized');

    try {
      const event = await this.app.webhooks.receive({
        id: headers['x-github-delivery'],
        name: headers['x-github-event'],
        signature: headers['x-hub-signature-256'],
        payload: body
      });

      return {
        event: event.name,
        action: event.payload.action,
        repository: event.payload.repository,
        sender: event.payload.sender,
        processed: true
      };
    } catch (error) {
      console.error('Failed to handle webhook:', error);
      throw error;
    }
  }

  // Branch Operations
  public async listBranches(owner: string, repo: string): Promise<any[]> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.repos.listBranches({
        owner,
        repo,
        per_page: 100
      });
      return data;
    } catch (error) {
      console.error('Failed to list branches:', error);
      return [];
    }
  }

  public async createBranch(owner: string, repo: string, name: string, sha: string): Promise<any> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${name}`,
        sha
      });
      return data;
    } catch (error) {
      console.error('Failed to create branch:', error);
      throw error;
    }
  }

  // Commit Operations
  public async listCommits(owner: string, repo: string, options: {
    sha?: string;
    path?: string;
    since?: string;
    until?: string;
    per_page?: number;
  } = {}): Promise<any[]> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.repos.listCommits({
        owner,
        repo,
        sha: options.sha,
        path: options.path,
        since: options.since,
        until: options.until,
        per_page: options.per_page || 30
      });
      return data;
    } catch (error) {
      console.error('Failed to list commits:', error);
      return [];
    }
  }

  // Search Operations
  public async searchCode(query: string, options: {
    sort?: 'indexed' | 'best-match';
    order?: 'desc' | 'asc';
    per_page?: number;
    page?: number;
  } = {}): Promise<any> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.search.code({
        q: query,
        sort: options.sort,
        order: options.order,
        per_page: options.per_page || 30,
        page: options.page || 1
      });
      return data;
    } catch (error) {
      console.error('Failed to search code:', error);
      return { items: [] };
    }
  }

  // Utility Methods
  private async getInstallationOwner(): Promise<string> {
    if (!this.installationOctokit) throw new Error('Installation not configured');

    try {
      const { data } = await this.installationOctokit.apps.getAuthenticated();
      return data.owner.login;
    } catch (error) {
      throw new Error('Failed to get installation owner');
    }
  }

  private transformRepository(repo: any): GitHubRepository {
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: {
        login: repo.owner.login,
        id: repo.owner.id,
        type: repo.owner.type
      },
      private: repo.private,
      htmlUrl: repo.html_url,
      description: repo.description,
      language: repo.language,
      createdAt: new Date(repo.created_at),
      updatedAt: new Date(repo.updated_at),
      pushedAt: repo.pushed_at ? new Date(repo.pushed_at) : undefined
    };
  }

  private transformPullRequest(pr: any): GitHubPullRequest {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      merged: pr.merged || false,
      mergeable: pr.mergeable,
      user: {
        login: pr.user.login,
        id: pr.user.id
      },
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha
      },
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined
    };
  }

  private transformIssue(issue: any): GitHubIssue {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      user: {
        login: issue.user.login,
        id: issue.user.id
      },
      labels: issue.labels.map((label: any) => ({
        name: label.name,
        color: label.color
      })),
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at),
      closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined
    };
  }

  // Health Check
  public async healthCheck(): Promise<boolean> {
    try {
      if (this.app) {
        await this.app.octokit.apps.getAuthenticated();
        return true;
      }
      return false;
    } catch (error) {
      console.error('GitHub service health check failed:', error);
      return false;
    }
  }
}