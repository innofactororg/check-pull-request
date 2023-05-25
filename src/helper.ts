import {info, notice, setOutput} from '@actions/core'
import {Octokit, RestEndpointMethodTypes} from '@octokit/rest'
import ignore from 'ignore'

type PullRequest = RestEndpointMethodTypes['pulls']['get']['response']['data']
type ReviewComments =
  RestEndpointMethodTypes['pulls']['listReviews']['response']['data']
type IssueLabels =
  RestEndpointMethodTypes['issues']['listLabelsOnIssue']['response']['data']
type RepoContent =
  RestEndpointMethodTypes['repos']['getContent']['response']['data']

interface CodeOwnerEntry {
  path: string
  owners: string[]
  match: (path: string) => boolean
}

interface CodeTeamEntry {
  label: string
  users: string[]
}

export class Helper {
  constructor(private octokit: Octokit) {}

  async getPull(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequest | null> {
    try {
      info(`Get pull request ${pullNumber}.`)
      const {data} = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber
      })
      return data
    } catch (error: unknown) {
      const message = `Failed to get pull request ${pullNumber}: ${JSON.stringify(
        error
      )}`
      setOutput('message', message)
      throw new Error(message)
    }
  }

  async getPullFiles(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<string[]> {
    try {
      info(`Get files in pull request ${pullNumber}.`)
      const {data} = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100
      })
      const fileStrings = data.map(f => `/${f.filename}`)
      return fileStrings
    } catch (error: unknown) {
      const message = `Failed to get files in pull request ${pullNumber}: ${JSON.stringify(
        error
      )}`
      setOutput('message', message)
      throw new Error(message)
    }
  }

  async getPullReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<ReviewComments | null> {
    try {
      info(`Get reviews for pull request ${pullNumber}.`)
      const {data} = await this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100
      })
      return data
    } catch (error: unknown) {
      const message = `Failed to get reviews for pull request ${pullNumber}: ${JSON.stringify(
        error
      )}`
      setOutput('message', message)
      throw new Error(message)
    }
  }

  async getLabelsOnIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueLabels | null> {
    try {
      info(`Get labels for issue ${issueNumber}.`)
      const {data} = await this.octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100
      })
      return data
    } catch (error: unknown) {
      const message = `Failed to get labels for issue ${issueNumber}: ${JSON.stringify(
        error
      )}`
      setOutput('message', message)
      throw new Error(message)
    }
  }

  async getCodeOwners(
    owner: string,
    repo: string,
    ref: string
  ): Promise<CodeOwnerEntry[]> {
    info('Get CODEOWNERS file:')
    const files: string[] = [
      'CODEOWNERS',
      '.github/CODEOWNERS',
      '.gitlab/CODEOWNERS',
      'docs/CODEOWNERS'
    ]
    let contentObject: RepoContent | undefined
    const codeOwnerEntries: CodeOwnerEntry[] = []
    for (const file of files) {
      try {
        const response = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path: file,
          ref
        })
        info(`- Found: ${file}`)
        contentObject = response.data
        break
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('Not Found')) {
          info(`- Not found: ${file}`)
        } else {
          const message = `Failed to get CODEOWNERS file: ${JSON.stringify(
            error
          )}`
          setOutput('message', message)
          throw new Error(message)
        }
      }
    }
    if (contentObject && (contentObject as {content: string}).content) {
      const content = JSON.parse(
        Buffer.from(
          (contentObject as {content: string}).content,
          (contentObject as {encoding: BufferEncoding}).encoding
        ).toString()
      ) as string
      const lines = content.split(/\r\n|\r|\n/)
      for (const line of lines) {
        if (!line || line.startsWith('#')) {
          continue
        }
        const [path, ...owners] = line.replace(/#.*/g, '').trim().split(/\s+/)
        const matcher = ignore().add(path)
        const match = matcher.ignores.bind(matcher)
        codeOwnerEntries.push({path, owners, match})
      }
      return codeOwnerEntries.reverse()
    } else {
      return codeOwnerEntries
    }
  }

  async getCodeTeams(
    owner: string,
    repo: string,
    ref: string
  ): Promise<CodeTeamEntry[]> {
    info('Get CODETEAMS file:')
    const files: string[] = [
      'CODETEAMS',
      '.github/CODETEAMS',
      '.gitlab/CODETEAMS',
      'docs/CODETEAMS'
    ]
    let contentObject: RepoContent | undefined
    const codeTeamEntries: CodeTeamEntry[] = []
    for (const file of files) {
      try {
        const response = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path: file,
          ref
        })
        info(`- Found: ${file}`)
        contentObject = response.data
        break
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('Not Found')) {
          info(`- Not found: ${file}`)
        } else {
          const message = `Failed to get CODETEAMS file: ${JSON.stringify(
            error
          )}`
          setOutput('message', message)
          throw new Error(message)
        }
      }
    }
    if (contentObject && (contentObject as {content: string}).content) {
      const content = JSON.parse(
        Buffer.from(
          (contentObject as {content: string}).content,
          (contentObject as {encoding: BufferEncoding}).encoding
        ).toString()
      ) as string
      const lines = content.split(/\r\n|\r|\n/)
      for (const line of lines) {
        if (!line || line.startsWith('#')) {
          continue
        }
        const [label, ...users] = line.replace(/#.*/g, '').trim().split(/\s+/)
        codeTeamEntries.push({label, users})
      }
      return codeTeamEntries.reverse()
    } else {
      return codeTeamEntries
    }
  }

  async getPullCodeOwners(
    files: string[],
    codeOwnerEntries: CodeOwnerEntry[]
  ): Promise<string[]> {
    const owners: string[] = []
    for (const file of files) {
      const relativePath = file.startsWith('/') ? file.slice(1) : file
      for (const entry of codeOwnerEntries) {
        if (entry.match(relativePath)) {
          for (const owner of entry.owners) {
            if (owner.includes('/')) {
              notice(`Owner ${owner} is a team. This owner will be ignored.`)
            } else if (owner.startsWith('@')) {
              info(`Owner ${owner} is a code owner of ${relativePath}.`)
              owners.push(owner)
            } else {
              notice(
                `Owner ${owner} don't start with @. This owner will be ignored.`
              )
            }
          }
        }
      }
    }
    return owners
  }

  async isActorOwner(
    actor: string,
    files: string[],
    codeOwnerEntries: CodeOwnerEntry[]
  ): Promise<boolean> {
    if (!codeOwnerEntries.find(e => e.owners.includes(`@${actor}`))) {
      info(`User ${actor} is not a code owner.`)
      return false
    }
    let isOwner: boolean
    for (const file of files) {
      const relativePath = file.startsWith('/') ? file.slice(1) : file
      isOwner = false
      for (const entry of codeOwnerEntries) {
        if (entry.match(relativePath)) {
          if (entry.owners.length === 0) {
            info(`The file ${file} has no code owners.`)
            return false
          }
          for (const owner of entry.owners) {
            if (owner.startsWith('@') && owner === `@${actor}`) {
              isOwner = true
              break
            }
          }
        }
      }
      if (isOwner) {
        info(`The file ${file} is owned by ${actor}.`)
      } else {
        info(`The file ${file} is not owned by ${actor}.`)
        return false
      }
    }
    return true
  }

  async isReviewed(
    owner: string,
    repo: string,
    pullNumber: number,
    owners: string[],
    prUser: string
  ): Promise<boolean> {
    const reviews = await this.getPullReviews(owner, repo, pullNumber)
    if (reviews !== null && reviews.length > 0) {
      for (const review of reviews) {
        const reviewer = review.user?.login
        if (
          review.state === 'APPROVED' &&
          (owners.length === 0 ||
            (owners.length === 1 && owners.includes(`@${reviewer}`)) ||
            (owners.includes(`@${reviewer}`) && prUser !== reviewer))
        ) {
          return true
        }
      }
    }
    return false
  }
}
