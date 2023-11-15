import {getInput} from '@actions/core'
import {context} from '@actions/github'

import {checkPullRequest} from './check-pr'
import {processError} from './error-tools'

async function run(): Promise<void> {
  try {
    const requireCodeOwnersFile = JSON.parse(
      getInput('require_codeowners_file', {required: true}).toLowerCase()
    ) as boolean
    const requireActorIsCodeOwner = JSON.parse(
      getInput('require_code_owner', {required: true}).toLowerCase()
    ) as boolean
    const requireCodeOwnerReview = JSON.parse(
      getInput('require_code_owner_review', {required: true}).toLowerCase()
    ) as boolean
    const requireCodeTeamsFile = JSON.parse(
      getInput('require_codeteams_file', {required: true}).toLowerCase()
    ) as boolean
    const requireCodeTeamReview = JSON.parse(
      getInput('require_code_team_review', {required: true}).toLowerCase()
    ) as boolean
    const requireApprovedReview = JSON.parse(
      getInput('require_approved_review', {required: true}).toLowerCase()
    ) as boolean
    const requiredMergeableStateInput = getInput('required_mergeable_state', {
      required: true
    })
    const requiredMergeableState = requiredMergeableStateInput
      ? (JSON.parse(requiredMergeableStateInput) as string[])
      : undefined

    const token = getInput('token', {required: true})
    const pullNumber =
      context.payload.pull_request?.number ?? context.payload.issue?.number

    if (pullNumber === undefined) {
      throw new Error(
        'This action require a pull request or issue comment event.'
      )
    }

    await checkPullRequest({
      pullNumber,
      requireCodeOwnersFile,
      requireActorIsCodeOwner,
      requireCodeOwnerReview,
      requireCodeTeamsFile,
      requireCodeTeamReview,
      requireApprovedReview,
      requiredMergeableState,
      token
    })
  } catch (error: unknown) {
    throw new Error(processError(error, true))
  }
}
void run()
