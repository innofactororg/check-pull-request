import {info, notice, setOutput, setFailed} from '@actions/core'
import {Octokit, RestEndpointMethodTypes} from '@octokit/rest'
import {RequestError as OctokitTypesRequestError} from '@octokit/types'
import {RequestError as OctokitRequestError} from '@octokit/request-error'
import ignore from 'ignore'

type PullRequest = RestEndpointMethodTypes['pulls']['get']['response']['data']
type ReviewComments =
  RestEndpointMethodTypes['pulls']['listReviews']['response']['data']
type IssueLabels =
  RestEndpointMethodTypes['issues']['listLabelsOnIssue']['response']['data']

type ErrorWithMessage = {
  message: string
}

type ErrorWithStatus = {
  status: number
}

interface CodeOwnerEntry {
  path: string
  owners: string[]
  match: (path: string) => boolean
}

interface CodeTeamEntry {
  label: string
  users: string[]
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  )
}

function isErrorWithStatus(error: unknown): error is ErrorWithStatus {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as Record<string, unknown>).status === 'number'
  )
}

function isOctokitTypesRequestError(
  error: unknown
): error is OctokitTypesRequestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as Record<string, unknown>).name === 'string' &&
    'status' in error &&
    typeof (error as Record<string, unknown>).status === 'number' &&
    'documentation_url' in error &&
    typeof (error as Record<string, unknown>).documentation_url === 'string'
  )
}

function getErrorString(error: unknown): string {
  if (isErrorWithMessage(error)) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function processError(
  error: unknown,
  fail = false,
  message?: string
): string {
  let errorMessage = getErrorString(error)
  let returnMessage = ''
  if (message && errorMessage !== '') {
    returnMessage = `${message} ${errorMessage}`
  } else if (message) {
    returnMessage = message
  } else if (errorMessage !== '') {
    returnMessage = errorMessage
  }
  errorMessage = ''
  if (error instanceof OctokitRequestError) {
    errorMessage = `HTTP response code ${error.status} from ${error.request.method} ${error.request.url}.`
    if (error.response?.data) {
      try {
        errorMessage = `${errorMessage}\nResponse body:\n${JSON.stringify(
          error.response.data,
          undefined,
          2
        )}`
      } catch {
        errorMessage = `${errorMessage}\nResponse body:\n${error.response.data}`
      }
    }
  } else if (isOctokitTypesRequestError(error)) {
    errorMessage = `HTTP response code ${error.status}. ${error.documentation_url}`
    if (error.errors && error.errors.length > 0) {
      for (const e of error.errors) {
        if (e.message) {
          errorMessage = `${errorMessage}\n${e.message} (${e.code} ${e.field} ${e.resource})`
        } else {
          errorMessage = `${errorMessage}\n${e.code} ${e.field} ${e.resource}`
        }
      }
    }
  } else if (isErrorWithStatus(error)) {
    errorMessage = `HTTP response code ${error.status}.`
  }
  if (returnMessage !== '' && errorMessage !== '') {
    returnMessage = `${returnMessage}\n${errorMessage}`
  } else if (errorMessage !== '') {
    returnMessage = errorMessage
  }
  if (fail) {
    setOutput('message', returnMessage)
    setFailed(returnMessage)
  }
  return returnMessage
}

export class Helper {
  constructor(private octokit: Octokit) {}

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | undefined> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      })
      if ((response.data as {content?: string}).content !== undefined) {
        info(`- Found: ${path}`)
        return Buffer.from(
          (response.data as {content: string}).content,
          (response.data as {encoding: BufferEncoding}).encoding
        ).toString('utf-8')
      }
      info(`- Not found (content missing): ${path}`)
      return undefined
    } catch (error: unknown) {
      if (isErrorWithStatus(error) && error.status === 404) {
        info(`- Not found: ${path}`)
        return undefined
      }
      throw new Error(processError(error, false))
    }
  }

  async getPull(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequest | null> {
    info(`Get pull request ${pullNumber}.`)
    const {data} = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
    })
    return data
  }

  async getPullFiles(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<string[]> {
    info(`Get files in pull request ${pullNumber}.`)
    const {data} = await this.octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    })
    const fileStrings = data.map(f => `/${f.filename}`)
    return fileStrings
  }

  async getPullReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<ReviewComments | null> {
    info(`Get reviews for pull request ${pullNumber}.`)
    const {data} = await this.octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    })
    return data
  }

  async getLabelsOnIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueLabels | null> {
    info(`Get labels for issue ${issueNumber}.`)
    const {data} = await this.octokit.rest.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100
    })
    return data
  }

  async getCodeOwners(
    owner: string,
    repo: string,
    ref: string
  ): Promise<CodeOwnerEntry[]> {
    info(`Look for CODEOWNERS file in ${ref} branch.`)
    const files: string[] = [
      'CODEOWNERS',
      '.github/CODEOWNERS',
      '.gitlab/CODEOWNERS',
      'docs/CODEOWNERS'
    ]
    const codeOwnerEntries: CodeOwnerEntry[] = []
    let content: string | undefined
    for (const file of files) {
      content = await this.getFileContent(owner, repo, file, ref)
      if (content) {
        const lines = content.split(/\r\n|\r|\n/)
        for (const line of lines) {
          if (!line || line.startsWith('#')) {
            continue
          }
          const [path, ...owners] = line.replace(/#.*/g, '').trim().split(/\s+/)
          const matcher = ignore().add(path)
          const match = matcher.ignores.bind(matcher)
          if (codeOwnerEntries.findIndex(p => p.path === path) === -1) {
            codeOwnerEntries.push({path, owners, match})
          }
        }
        return codeOwnerEntries.reverse()
      }
    }
    return codeOwnerEntries
  }

  async getCodeTeams(
    owner: string,
    repo: string,
    ref: string
  ): Promise<CodeTeamEntry[]> {
    info(`Look for CODETEAMS file in ${ref} branch.`)
    const files: string[] = [
      'CODETEAMS',
      '.github/CODETEAMS',
      '.gitlab/CODETEAMS',
      'docs/CODETEAMS'
    ]
    const codeTeamEntries: CodeTeamEntry[] = []
    let content: string | undefined
    for (const file of files) {
      content = await this.getFileContent(owner, repo, file, ref)
      if (content) {
        const lines = content.split(/\r\n|\r|\n/)
        for (const line of lines) {
          if (!line || line.startsWith('#')) {
            continue
          }
          const [label, ...users] = line.replace(/#.*/g, '').trim().split(/\s+/)
          if (codeTeamEntries.findIndex(l => l.label === label) === -1) {
            codeTeamEntries.push({label, users})
          }
        }
        return codeTeamEntries.reverse()
      }
    }
    return codeTeamEntries
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
              notice(`Owner ${owner} is a team. Teams will be ignored.`)
            } else if (owner.startsWith('@')) {
              if (owners.findIndex(o => o === owner) === -1) {
                owners.push(owner)
              }
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
          info(`Pull request ${pullNumber} was approved by ${reviewer}.`)
          return true
        }
      }
      info(`Pull request ${pullNumber} has not been approved.`)
    } else {
      notice(`Pull request ${pullNumber} has no reviews.`)
    }
    return false
  }
}
