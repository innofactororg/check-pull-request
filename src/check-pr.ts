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
  requireCodeOwnersFile,
  requireActorIsCodeOwner,
  requireCodeOwnerReview,
  requireCodeTeamsFile,
  requireCodeTeamReview,
  requiredMergeableState,
  token
}: Readonly<{
  pullNumber: number
  requireCodeOwnersFile: boolean
  requireActorIsCodeOwner: boolean
  requireCodeOwnerReview: boolean
  requireCodeTeamsFile: boolean
  requireCodeTeamReview: boolean
  requiredMergeableState: string[] | undefined
  token: string
}>): Promise<void> => {
  const {owner, repo} = context.repo
  const {actor} = context
  const octokit = new Octokit({
    auth: `token ${token || process.env.GITHUB_TOKEN}`,
    baseUrl: 'https://api.github.com'
  })

  const HelperApi = new Helper(octokit)
  const pr = await HelperApi.getPull(owner, repo, pullNumber)
  if (pr?.base.ref && pr?.user?.login) {
    let codeOwnerEntries: CodeOwnerEntry[] = []
    let files: string[] = []
    const prUser = pr?.user?.login
    if (
      requireCodeOwnersFile ||
      requireActorIsCodeOwner ||
      requireCodeOwnerReview
    ) {
      codeOwnerEntries = await HelperApi.getCodeOwners(owner, repo, pr.base.ref)
      if (requireCodeOwnersFile && codeOwnerEntries.length === 0) {
        throw new Error(
          `Failed to get CODEOWNERS. This repository requires that a CODEOWNERS file exist in the ${pr?.base.ref} branch. About code owners: https://t.ly/8KUb`
        )
      }
      files = await HelperApi.getPullFiles(owner, repo, pullNumber)
      if (requireActorIsCodeOwner) {
        if (codeOwnerEntries.length === 0) {
          notice(
            `Found no CODEOWNERS file in the ${pr?.base.ref} branch of the ${repo} repository. Without a CODEOWNERS file, everyone is considered a code owner.`
          )
        } else if (files) {
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
      }
    }
    if (requireCodeOwnerReview) {
      const owners = await HelperApi.getPullCodeOwners(files, codeOwnerEntries)
      const hasReview = await HelperApi.isReviewed(
        owner,
        repo,
        pullNumber,
        owners,
        prUser
      )
      if (!hasReview) {
        throw new Error(
          `Pull request ${pullNumber} has not been approved by a code owner (${owners.join(
            ','
          )}).`
        )
      }
    }
    if (requireCodeTeamsFile || requireCodeTeamReview) {
      const codeTeamEntries = await HelperApi.getCodeTeams(
        owner,
        repo,
        pr.base.ref
      )
      if (requireCodeTeamsFile && codeTeamEntries.length === 0) {
        throw new Error(
          `Failed to get CODETEAMS. This repository requires that a CODETEAMS file exist in the ${pr?.base.ref} branch.`
        )
      }
      if (codeTeamEntries.length === 0) {
        notice(
          `A CODETEAMS file is missing in the ${pr?.base.ref} branch of the ${repo} repository. Without a CODETEAMS file, the input parameter 'require_code_team_review' has no effect.`
        )
      } else {
        const labels = await HelperApi.getLabelsOnIssue(owner, repo, pullNumber)
        if (!labels) {
          throw new Error(
            `Pull request ${pullNumber} has no labels, but a code team review is required. Please add label according to the CODETEAMS file.`
          )
        }
        let pullUser = ''
        for (const entry of codeTeamEntries) {
          if (labels.findIndex(e => e.name === entry.label) === -1) {
            throw new Error(
              `Found required label ${entry.label} in the CODETEAMS file. Please add the label to pull request ${pullNumber} and request a review.`
            )
          }
          pullUser = 'skipPrUserTest'
          if (entry.users.length !== 1) {
            pullUser = prUser
          }
          const hasReview = await HelperApi.isReviewed(
            owner,
            repo,
            pullNumber,
            entry.users,
            pullUser
          )
          if (!hasReview) {
            throw new Error(
              `Pull request ${pullNumber} has not been approved by a ${
                entry.label
              } code team user (${entry.users.join(',')}).`
            )
          }
        }
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
        let merge_message = ''
        switch (pr.mergeable_state) {
          case 'clean':
            merge_message = 'is in a clean state'
            break
          case 'has_hooks':
            merge_message = 'has a passing commit status with pre-receive hooks'
            break
          case 'unstable':
            merge_message = 'has a non-passing commit status (unstable)'
            break
          case 'behind':
            merge_message = 'has out of date head ref'
            break
          case 'blocked':
            merge_message = 'is blocked'
            break
          case 'dirty':
            merge_message =
              'is dirty, the merge commit cannot be cleanly created'
            break
          case 'draft':
            merge_message = 'is blocked due to the pull request being a draft'
            break
          default:
            merge_message = 'is in a undetermined state'
            break
        }
        if (requiredMergeableState.includes(pr.mergeable_state)) {
          info(`Pull request ${pullNumber} ${merge_message}.`)
        } else {
          throw new Error(`Pull request ${pullNumber} ${merge_message}.`)
        }
      } else {
        throw new Error(`Pull request ${pullNumber} is not mergable.`)
      }
    }
  } else {
    throw new Error(`Unable to get pull request ${pullNumber}.`)
  }
}
