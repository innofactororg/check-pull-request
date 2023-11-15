import {setOutput, setFailed} from '@actions/core'
import {RequestError as OctokitTypesRequestError} from '@octokit/types'
import {RequestError as OctokitRequestError} from '@octokit/request-error'

type ErrorWithMessage = {
  message: string
}

type ErrorWithStatus = {
  status: number
}

function getErrorString(error: unknown): string {
  if (isErrorWithMessage(error)) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  )
}

export function isErrorWithStatus(error: unknown): error is ErrorWithStatus {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as Record<string, unknown>).status === 'number'
  )
}

export function isOctokitTypesRequestError(
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
