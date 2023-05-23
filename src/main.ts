import {getInput, setFailed} from '@actions/core'
import {context} from '@actions/github'
import ensureError from 'ensure-error'

import {checkPullRequest} from './check-pr'

async function run(): Promise<void> {
  try {
    const requireActorIsCodeOwner = JSON.parse(
      getInput('require_code_owner', {required: true}).toLowerCase()
    ) as boolean
    const requireCodeOwnerReview = JSON.parse(
      getInput('require_code_owner_review', {required: true}).toLowerCase()
    ) as boolean
    const requireCodeTeamReview = JSON.parse(
      getInput('require_code_team_review', {required: true}).toLowerCase()
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
      requireActorIsCodeOwner,
      requireCodeOwnerReview,
      requireCodeTeamReview,
      requiredMergeableState,
      token
    })
  } catch (_error: unknown) {
    const error = ensureError(_error)
    setFailed(error)
  }
}
void run()
