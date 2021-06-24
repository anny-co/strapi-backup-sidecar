# strapi-backup-sidecar

NodeJS utility script + container to run as a sidecar with a strapi container.
Implements periodic backups using node-cron and uploading the gzipped tarballs
to AWS S3 using @aws-sdk/client-s3.

## Building

Commit the changes, then use `yarn version` to create a new package version. The
`postversion` hook will also push the tag to the repository and, provided that
you're authenticated to the GitHub npm package registry, publish the package.

The freshly created git tag will trigger the GitHub action to build a container
image off of the recently published version. This container image is then
available at `ghcr.io/anny-co/strapi-backup-sidecar:$VERSION` or
`ghcr.io/anny-co/strapi-backup-sidecar:latest`