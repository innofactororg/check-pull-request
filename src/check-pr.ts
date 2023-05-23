import {info, notice} from '@actions/core'
import {context} from '@actions/github'
import {Octokit} from '@octokit/rest'
import {Helper} from './helper'

interface CodeOwnerEntry {
  path: string
  owners: string[]
  match: (path: string) => boolean
}

export const checkPullRequest = async ({
  pullNumber,
  requireActorIsCodeOwner,
  requireCodeOwnerReview,
  requireCodeTeamReview,
  requiredMergeableState,
  token
}: Readonly<{
  pullNumber: number
  requireActorIsCodeOwner: boolean
  requireCodeOwnerReview: boolean
  requireCodeTeamReview: boolean
  requiredMergeableState: string[] | undefined
  token: string
}>): Promise<void> => {
  const {owner, repo} = context.repo
  const {actor} = context
  try {
    const octokit = new Octokit({
      auth: `token ${token || process.env.GITHUB_TOKEN}`,
      baseUrl: 'https://api.github.com'
    })

    const HelperApi = new Helper(octokit)
    const pr = await HelperApi.getPull(owner, repo, pullNumber)
    if (pr?.base.sha && pr?.user?.login) {
      let codeOwnerEntries: CodeOwnerEntry[] = []
      let files: string[] = []
      const prUser = pr?.user?.login
      if (requireActorIsCodeOwner || requireCodeOwnerReview) {
        codeOwnerEntries = await HelperApi.getCodeOwners(
          owner,
          repo,
          pr?.base.sha
        )
        files = await HelperApi.getPullFiles(owner, repo, pullNumber)
        if (requireActorIsCodeOwner) {
          if (codeOwnerEntries) {
            if (files) {
              const isOwner = await HelperApi.isActorOwner(
                actor,
                files,
                codeOwnerEntries
              )
              if (!isOwner) {
                throw new Error(
                  `User ${actor} don't own all the changed files of pull request ${pullNumber}.`
                )
              }
            } else {
              notice(
                `Could not find any changed files in pull request ${pullNumber}. This is unexpected.`
              )
            }
          } else {
            notice(
              `A CODEOWNERS file is missing in the ${pr?.base.ref} branch of the ${repo} repository. Without a CODEOWNERS file, everyone is considered a code owner.`
            )
          }
        }
      }
      if (requireCodeOwnerReview) {
        const owners = await HelperApi.getPullCodeOwners(
          files,
          codeOwnerEntries
        )
        const hasReview = await HelperApi.isReviewed(
          owner,
          repo,
          pullNumber,
          owners,
          prUser
        )
        if (!hasReview) {
          throw new Error(
            `Pull request ${pullNumber} has not been approved by a code owner.`
          )
        }
      }
      if (requireCodeTeamReview) {
        const codeTeamEntries = await HelperApi.getCodeTeams(
          owner,
          repo,
          pr?.base.sha
        )
        if (codeTeamEntries) {
          const labels = await HelperApi.getLabelsOnIssue(
            owner,
            repo,
            pullNumber
          )
          if (!labels) {
            throw new Error(
              `Pull request ${pullNumber} has no labels, but a CODETEAMS file exist and a code team review is required. Please add labels according to CODETEAMS file.`
            )
          }
          let pullUser = ''
          // loop through each of the CODETEAM lines
          for (const entry of codeTeamEntries) {
            // if label in CODETEAM line don't exist in PR labels
            if (labels.findIndex(e => e.name === entry.label) === -1) {
              throw new Error(
                `The CODETEAMS file has label ${entry.label}, but the pull request ${pullNumber} don't. Please add the label to the pull request.`
              )
            }
            // CODETEAM label exist in PR
            // if only one team member user in CODETEAM line then prUser can be approver
            pullUser = 'skipPrUserTest'
            // if not only one team member user in CODETEAM line
            if (entry.users.length !== 1) {
              // approver that opened the pull request (prUser) will be ignored
              pullUser = prUser
            }
            // check if a CODETEAM user has reviewed
            const hasReview = await HelperApi.isReviewed(
              owner,
              repo,
              pullNumber,
              entry.users,
              pullUser
            )
            // if a CODETEAM user has not reviewed
            if (!hasReview) {
              throw new Error(
                `Pull request ${pullNumber} has not been approved by a code team user (${entry.users.join(
                  ','
                )}) for label ${entry.label}.`
              )
            }
          }
        } else {
          notice(
            `A CODETEAMS file is missing in the ${pr?.base.ref} branch of the ${repo} repository. Without a CODETEAMS file, the input parameter 'require_code_team_review' has no effect.`
          )
        }
      }
      if (requiredMergeableState && requiredMergeableState.length > 0) {
        if (pr.merged) {
          info(`Pull request ${pullNumber} is merged.`)
        } else if (pr.mergeable === null) {
          throw new Error(
            `The mergable state of pull request ${pullNumber} is unknown.`
          )
        } else if (pr.mergeable) {
          let message = ''
          switch (pr.mergeable_state) {
            case 'clean':
              message = 'is in a clean state'
              break
            case 'has_hooks':
              message = 'has a passing commit status with pre-receive hooks'
              break
            case 'unstable':
              message = 'has a non-passing commit status (unstable)'
              break
            case 'behind':
              message = 'has out of date head ref'
              break
            case 'blocked':
              message = 'is blocked'
              break
            case 'dirty':
              message = 'is dirty, the merge commit cannot be cleanly created'
              break
            case 'draft':
              message = 'is blocked due to the pull request being a draft'
              break
            default:
              message = 'is in a undetermined state'
              break
          }
          if (requiredMergeableState.includes(pr.mergeable_state)) {
            info(`Pull request ${pullNumber} ${message}.`)
          } else {
            throw new Error(`Pull request ${pullNumber} ${message}.`)
          }
        } else {
          throw new Error(`Pull request ${pullNumber} is not mergable.`)
        }
      }
    } else {
      throw new Error(`Unable to get pull request ${pullNumber}.`)
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to check pull request: ${error.message} (${error.name})`
      )
    } else {
      throw new Error(`Failed to check pull request: ${JSON.stringify(error)}`)
    }
  }
}
