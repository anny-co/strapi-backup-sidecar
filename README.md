# strapi-backup-sidecar

NodeJS utility script + container to run as a sidecar with a strapi container. Implements periodic backups using node-cron and uploading the gzipped tarballs to AWS S3 using @aws-sdk/client-s3.

## Building

Following a strict semver, changing anything, you MUST publish the new package version before creating the container.

Then, just run `node build.js`. You can specify the current version, but the CLI will assume a monotonous version number and build the images from the version supplied in package.json. It will build, tag and push
both $VERSION, and 'latest'.
