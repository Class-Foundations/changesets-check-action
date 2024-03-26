import * as core from '@actions/core';
import * as github from '@actions/github';

import humanId from 'human-id';

import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';

type IssuesListCommentsParams = RestEndpointMethodTypes['issues']['listComments']['parameters'];
type PullsListFilesParams = RestEndpointMethodTypes['pulls']['listFiles']['parameters'];
type Octokit = ReturnType<typeof github.getOctokit>;

const changesetActionSignature = `<!-- changeset-check-action-signature -->`;

let addChangesetUrl = `${github.context.payload.pull_request!.head.repo.html_url}/new/${
    github.context.payload.pull_request!.head.ref
}?filename=.changeset/${humanId({
    separator: '-',
    capitalize: false,
})}.md`;

const getAbsentMessage = (commitSha: string) => {
    return `\
###  💥  No Changeset
Latest commit: ${commitSha}

Merging this PR will not include it in the release notes of the next release. If this is a customer facing change, **please create a changeset for this PR.**

To add a changeset, follow these simple steps:

\`\`\`
npm exec class-ui-changeset // select "patch" for bugfixes, "minor" for features, and "major" for big overhauls/highlighted features.
\`\`\`

After the changeset file was generated in the \`.changeset\` directory, open it in your editor and add any further changes you need. **Be as descriptive as possible.**
Then, simply commit and push the created changeset.

[Click here to learn what changesets are](https://github.com/Noviny/changesets/blob/master/docs/adding-a-changeset.md).

More info about class-ui-changeset [here](https://classedu.github.io/class-ui/docs/release-tools/class-ui-changeset).

[Click here if you're a maintainer who wants to add a changeset to this PR](${addChangesetUrl})
${changesetActionSignature}`;
};

const getApproveMessage = (commitSha: string) => {
    return `\
###  🦋  Changeset is good to go
Latest commit: ${commitSha}

**Thank you for adding a changeset.** This will help ensure our releases are predictable and of high quality.

Not sure what this means? [Click here to learn what changesets are](https://github.com/Noviny/changesets/blob/master/docs/adding-a-changeset.md).
${changesetActionSignature}`;
};

const getCommentId = async (octokit: Octokit, params: IssuesListCommentsParams): Promise<number | null> => {
    const comments = await octokit.rest.issues.listComments(params);

    return comments.data.find((comment) => comment.body?.includes(changesetActionSignature))?.id || null;
};

const getHasChangeset = async (octokit: Octokit, params: PullsListFilesParams): Promise<boolean> => {
    const files = await octokit.rest.pulls.listFiles(params);

    return files.data.some((file) => {
        return file.filename.startsWith('.changeset') && file.status === 'added';
    });
};

(async () => {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        core.setFailed('Please add the GITHUB_TOKEN to the changesets action');
        return;
    }

    const octokit = github.getOctokit(githubToken);

    console.log(JSON.stringify(github.context.payload, null, 2));

    const [commentId, hasChangeset] = await Promise.all([
        getCommentId(octokit, {
            issue_number: github.context.payload.pull_request!.number,
            ...github.context.repo,
        }),
        getHasChangeset(octokit, {
            pull_number: github.context.payload.pull_request!.number,
            ...github.context.repo,
        }),
    ]);

    const message = hasChangeset ? getApproveMessage(github.context.sha) : getAbsentMessage(github.context.sha);

    if (commentId) {
        return octokit.rest.issues.updateComment({
            comment_id: commentId,
            body: message,
            ...github.context.repo,
        });
    }

    return octokit.rest.issues.createComment({
        ...github.context.repo,
        issue_number: github.context.payload.pull_request!.number,
        body: message,
    });
})().catch((err) => {
    console.error(err);
    core.setFailed(err.message);
});
