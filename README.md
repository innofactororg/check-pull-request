# Pull Request Check

This action can be used to check a pull request before another action
is allowed, like for example auto merge. It can be used in relation to
events triggered by a pull request or a pull request issue comment.

It will fail if one of the checks don't pass.

## Usage

<!-- start usage -->
```yaml
jobs:
  check:
    name: Check Pull Request
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
    - name: Check Pull Request
      uses: innofactororg/github-action-check-pull@v1
      with:
        # Require a CODEOWNERS file.
        #
        # The check will fail if the repository don't have a CODEOWNERS file in
        # either the root, docs/, or .github/ directory.
        # About code owners: https://t.ly/8KUb
        #
        # The CODEOWNERS file is retrieved from the base branch of a
        # pull request (e.g. main), so it can be protected.
        #
        # Default: false
        require_codeowners_file: false

        # Check that actor is code owner.
        #
        # Without a CODEOWNERS file, everyone is considered a code owner.
        # The check will fail if the actor (the user that initiated this check)
        # is not a code owner.
        #
        # Default: true
        require_code_owner: true

        # Check that a code owner has reviewed and approved the pull request.
        # The code owner can't be the user who opened the pull request.
        #
        # Note: This action will ignore emails and teams specified in CODEOWNERS file.
        #
        # Default: true
        require_code_owner_review: true

        # Require a CODETEAMS file.
        #
        # The check will fail if the repository don't have a CODETEAMS file in
        # either the root, docs/, or .github/ directory.
        #
        # The CODETEAMS file is retrieved from the base branch of a
        # pull request (e.g. main), so it can be protected.
        #
        # Default: false
        require_codeteams_file: false

        # Check that a code team member has reviewed and approved the pull request.
        # The code team member can't be the user who opened the pull request, unless
        # the user is the only team member.
        #
        # For the check to run, the repository must have a CODETEAMS file in
        # either the root, docs/, or .github/ directory of the repository.
        #
        # Default: true
        require_code_team_review: true

        # Check that at least one approved review exist for the pull request.
        # The reviewer can't be the user who opened the pull request.
        #
        # Default: true
        require_approved_review: true

        # Check that the pull request mergable state is in one of the specified states.
        #
        # The value is a JSON-stringified list of one or more states:
        # clean
        # has_hooks
        # unstable
        # behind
        # blocked
        # dirty
        # draft
        #
        # Default: ["clean","has_hooks","unstable"]
        required_mergeable_state: |-
          ["clean","has_hooks","unstable"]

        # The GitHub token for checking the pull request.
        #
        # Default: secrets.GITHUB_TOKEN
        token: ${{ secrets.GITHUB_TOKEN }}
```

## Example of a CODEOWNERS file

```text
# This is a comment.
# Each line is a file pattern followed by one or more owners.

# These owners will be the default owners for everything in
# the repo. Unless a later match takes precedence.
* @global-owner1 @global-owner2

# In this example, @doctocat owns any files in the build/logs
# directory at the root of the repository and any of its
# subdirectories.
/build/logs/ @doctocat

# In this example, @octocat owns any file in an apps directory
# anywhere in the repository.
apps/ @octocat

# In this example, @doctocat owns any file in the `/docs`
# directory in the root of your repository and any of its
# subdirectories.
/docs/ @doctocat

# In this example, any change inside the `/scripts` directory
# will require approval from @doctocat or @octocat.
/scripts/ @doctocat @octocat

# In this example, @octocat owns any file in a `/logs` directory such as
# `/build/logs`, `/scripts/logs`, and `/deeply/nested/logs`. Any changes
# in a `/logs` directory will require approval from @octocat.
**/logs @octocat

# In this example, @octocat owns any file in the `/apps`
# directory in the root of your repository except for the `/apps/github`
# subdirectory, as its owners are left empty.
/apps/ @octocat
/apps/github
```

## Example of a CODETEAMS file

```text
# This is a comment.
# Each line start with a GitHub label followed by one or more users.

# In this example, a pull request labeled `require-team-review/security`
# will require approval review from @octocat.
require-team-review/security @octocat

# In this example, a pull request labeled `need security review`
# will require approval review from @doctocat or @octocat.
"need security review" @doctocat @octocat
```
