import * as core from "@actions/core";
import * as github from "@actions/github";
import { IssuesListCommentsParams, PullsListFilesParams } from "@octokit/rest";
// @ts-ignore
import humanId from "human-id";

const changesetActionSignature = `<!-- changeset-check-action-signature -->`;

let addChangesetUrl = `${
  github.context.payload.pull_request!.head.repo.html_url
}/new/${
  github.context.payload.pull_request!.head.ref
}?filename=.changeset/${humanId({
  separator: "-",
  capitalize: false
})}.md`;

function getAbsentMessage(commitSha: string) {
  return `###  💥  No Changeset
Latest commit: ${commitSha}

Merging this PR will not include it in the release notes of the next release. If this is a customer facing change, **please create a changeset for this PR.**

To add a changeset, follow these simple steps:

\`\`\`
npm run changeset // select "patch" for bugfixes, "minor" for features, and "major" for big overhauls/highlighted features.
\`\`\`

After the changeset file was generated in the \`.changeset\` directory, open it in your editor and add any further changes you need. **Be as descriptive as possible.**
Then, simply commit and push the created changeset.

[Click here to learn what changesets are](https://github.com/Noviny/changesets/blob/master/docs/adding-a-changeset.md).

[Click here if you're a maintainer who wants to add a changeset to this PR](${addChangesetUrl})
${changesetActionSignature}`;
}
function getApproveMessage(commitSha: string) {
  return `###  🦋  Changeset is good to go
Latest commit: ${commitSha}

**Thank you for adding a changeset.** This will help ensure our releases are predictable and of high quality.

Not sure what this means? [Click here to learn what changesets are](https://github.com/Noviny/changesets/blob/master/docs/adding-a-changeset.md).
${changesetActionSignature}`;
}

const getCommentId = (
  octokit: github.GitHub,
  params: IssuesListCommentsParams
) =>
  octokit.issues.listComments(params).then(comments => {
    const changesetBotComment = comments.data.find(comment =>
      comment.body.includes(changesetActionSignature)
    );
    return changesetBotComment ? changesetBotComment.id : null;
  });

const getHasChangeset = (
  octokit: github.GitHub,
  params: PullsListFilesParams
) =>
  octokit.pulls.listFiles(params).then(files => {
    const changesetFiles = files.data.filter(
      file => file.filename.startsWith(".changeset") && file.status === "added"
    );
    return changesetFiles.length > 0;
  });

(async () => {
  let githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    core.setFailed("Please add the GITHUB_TOKEN to the changesets action");
    return;
  }
  let repo = `${github.context.repo.owner}/${github.context.repo.repo}`;

  const octokit = new github.GitHub(githubToken);
  console.log(JSON.stringify(github.context.payload, null, 2));
  const [commentId, hasChangeset] = await Promise.all([
    getCommentId(octokit, {
      issue_number: github.context.payload.pull_request!.number,
      ...github.context.repo
    }),
    getHasChangeset(octokit, {
      pull_number: github.context.payload.pull_request!.number,
      ...github.context.repo
    })
  ]);

  let message = hasChangeset
    ? getApproveMessage(github.context.sha)
    : getAbsentMessage(github.context.sha);

  if (commentId) {
    return octokit.issues.updateComment({
      comment_id: commentId,
      body: message,
      ...github.context.repo
    });
  }
  return octokit.issues.createComment({
    ...github.context.repo,
    issue_number: github.context.payload.pull_request!.number,
    body: message
  });
})().catch(err => {
  console.error(err);
  core.setFailed(err.message);
});
